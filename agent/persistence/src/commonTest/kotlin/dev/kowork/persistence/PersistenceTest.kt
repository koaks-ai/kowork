package dev.kowork.persistence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.koaks.framework.memory.ConversationTurn
import org.koaks.framework.memory.TurnStatus
import org.koaks.framework.model.CheckpointScope
import org.koaks.framework.model.ModelItem
import org.koaks.framework.model.ProviderCheckpoint
import org.koaks.framework.model.ProviderId
import org.koaks.framework.model.TranscriptBasis
import org.koaks.framework.model.Usage
import okio.ByteString.Companion.encodeUtf8

internal expect fun freshPersistenceDatabase(): PersistenceDatabase

class PersistenceTest {
    @Test
    fun schemaHasAllTablesAndForeignKeysAreEnabled() = withDatabase { database ->
        val tableCount = database.driver.query(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            mapper = { cursor -> cursor.nextOrFail("table count"); app.cash.sqldelight.db.QueryResult.Value(cursor.long(0, "table.count")) },
        )
        assertEquals(15L, tableCount)
        val foreignKeys = database.driver.query(
            "PRAGMA foreign_keys",
            mapper = { cursor -> cursor.nextOrFail("foreign_keys"); app.cash.sqldelight.db.QueryResult.Value(cursor.long(0, "foreign_keys")) },
        )
        assertEquals(1L, foreignKeys)
        assertFailsWith<Throwable> {
            database.driver.exec(
                "INSERT INTO model_profiles(id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                9,
            ) {
                bindString(0, "orphan-profile"); bindString(1, "missing-provider"); bindString(2, "orphan")
                bindString(3, "model"); bindLong(4, 1); bindString(5, "test"); bindLong(6, 1); bindLong(7, 1); bindLong(8, 1)
            }
        }
        Unit
    }

    @Test
    fun branchesKeepParentLineageAndIndependentHeads() = withDatabase { database ->
        val fixture = fixture(database)
        val first = turn("t1", "first")
        val second = turn("t2", "second")
        val third = turn("t3", "third")
        database.conversations.appendTurn(fixture.mainBranch.id, first, 10)
        database.conversations.appendTurn(fixture.mainBranch.id, second, 20)
        database.conversations.appendTurn(fixture.mainBranch.id, third, 30)

        val forkA = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, second.id, "fork-a", now = 40)
        val forkB = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, second.id, "fork-b", now = 41)
        val forkTurn = turn("fork-a-t1", "fork answer")
        database.conversations.appendTurn(forkA.id, forkTurn, 50)

        assertEquals(listOf("t1", "t2", "t3"), database.conversations.lineage(fixture.mainBranch.id).map { it.id })
        assertEquals(listOf("t1", "t2", "fork-a-t1"), database.conversations.lineage(forkA.id).map { it.id })
        assertEquals(listOf("t1", "t2"), database.conversations.lineage(forkB.id).map { it.id })
        assertEquals(forkTurn.id, database.branches.get(forkA.id).headTurnId)
        assertEquals(second.id, database.branches.get(forkB.id).forkTurnId)
        assertFailsWith<Throwable> {
            database.branches.createMain(fixture.mainBranch.copy(id = "duplicate-main", createdAt = 60, updatedAt = 60))
        }
        Unit
    }

    @Test
    fun invalidForksFailFast() = withDatabase { database ->
        val fixture = fixture(database)
        val first = turn("t1", "first")
        database.conversations.appendTurn(fixture.mainBranch.id, first, 10)
        val other = otherFixture(database)
        assertFailsWith<Throwable> {
            database.branches.forkBranch(other.thread.id, fixture.mainBranch.id, first.id, "cross-thread", now = 20)
        }
        val child = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, first.id, "child", now = 21)
        val second = turn("t2", "second")
        database.conversations.appendTurn(fixture.mainBranch.id, second, 22)
        assertFailsWith<Throwable> {
            database.branches.forkBranch(fixture.thread.id, child.id, second.id, "cross-lineage", now = 23)
        }
        assertFailsWith<Throwable> {
            database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, "not-committed", "missing", now = 24)
        }
        Unit
    }

    @Test
    fun queueRunsAndEventsAreBranchScoped() = withDatabase { database ->
        val fixture = fixture(database)
        val first = turn("t1", "first")
        database.conversations.appendTurn(fixture.mainBranch.id, first, 10)
        val fork = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, first.id, "side", BranchKind.SIDE_CHAT, 11)
        val mainOne = database.queue.enqueue(fixture.mainBranch.id, "main one", fixture.profile.id, 4096, "q-main-1", 20)
        database.queue.enqueue(fixture.mainBranch.id, "main two", fixture.profile.id, 4096, "q-main-2", 21)
        val sideOne = database.queue.enqueue(fork.id, "side one", fixture.profile.id, 4096, "q-side-1", 22)
        assertEquals(mainOne.id, database.queue.next(fixture.mainBranch.id)?.id)
        assertEquals(sideOne.id, database.queue.next(fork.id)?.id)

        val mainRun = database.runs.create(fixture.mainBranch.id, mainOne.id, "run-main", 30)
        val sideRun = database.runs.create(fork.id, sideOne.id, "run-side", 31)
        assertFailsWith<Throwable> { database.branches.archive(fork.id, 32) }
        assertFailsWith<Throwable> {
            database.approvals.create(
                ApprovalRecord(
                    id = "bad-approval",
                    projectId = fixture.project.id,
                    threadId = fixture.thread.id,
                    branchId = fork.id,
                    runId = mainRun.id,
                    kind = "tool",
                    title = "Approve",
                    detail = "detail",
                    status = "pending",
                    requestedPath = null,
                    requestedAccess = null,
                    createdAt = 32,
                    resolvedAt = null,
                ),
            )
        }
        assertFailsWith<Throwable> {
            database.pathGrants.create(PathGrantRecord("bad-grant", mainRun.id, fork.id, "/tmp", "read", true, 32))
        }
        assertEquals(mainRun.id, database.runs.list(fixture.mainBranch.id).single().id)
        assertEquals(sideRun.id, database.runs.list(fork.id).single().id)
        database.events.append(
            EventRecord(
                0,
                "event-main",
                fixture.project.id,
                fixture.thread.id,
                fixture.mainBranch.id,
                mainRun.id,
                "run.started",
                "{}",
                32,
            ),
        )
        database.events.append(EventRecord(0, "event-global", null, null, null, null, "server.started", "{}", 33))
        database.events.append(
            EventRecord(0, "event-side", fixture.project.id, fixture.thread.id, fork.id, sideRun.id, "run.started", "{}", 34),
        )
        val events = database.events.list()
        assertEquals(listOf("event-main", "event-global", "event-side"), events.map { it.id })
        assertEquals(listOf("event-side"), database.events.list(branchId = fork.id).map { it.id })
        assertTrue(database.events.lastSequence() > events.first().sequence)
        assertFailsWith<Throwable> {
            database.events.append(EventRecord(0, "event-bad", null, null, null, null, "broken", "{", 35))
        }
        assertEquals(setOf(mainRun.id, sideRun.id), database.runs.recoverInterrupted(40).map { it.id }.toSet())
        assertTrue(database.branches.get(fixture.mainBranch.id).queuePaused)
        assertTrue(database.branches.get(fork.id).queuePaused)
        assertEquals(QueueStatus.INTERRUPTED, database.queue.get(mainOne.id).status)
        assertEquals(QueueStatus.INTERRUPTED, database.queue.get(sideOne.id).status)
    }

    @Test
    fun compressionHasSeparateModelAndDisplayProjections() = withDatabase { database ->
        val fixture = fixture(database)
        val first = turn("t1", "old user")
        val second = turn("t2", "old answer")
        val third = turn("t3", "new user")
        listOf(first, second, third).forEachIndexed { index, turn ->
            database.conversations.appendTurn(fixture.mainBranch.id, turn, (index + 1).toLong())
        }
        database.conversations.addCompressionCheckpoint(
            CompressionCheckpointRecord("cp-main", fixture.thread.id, fixture.mainBranch.id, fixture.profile.id, "old context", second.id, 12, 10),
        )
        val context = database.conversations.loadModelContext(fixture.mainBranch.id)
        assertEquals(listOf("Conversation summary:\nold context", "new user", "new user answer"), context.items.map { (it as ModelItem.Message).text })
        val display = database.conversations.loadDisplayConversation(fixture.mainBranch.id)
        assertEquals(4, display.size)
        assertTrue(display[2] is DisplayConversationEntry.SummaryNotification)
        assertEquals(listOf("t1", "t2", "t3"), display.filterIsInstance<DisplayConversationEntry.Turn>().map { it.value.id })

        val child = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, second.id, "summary-child", now = 20)
        assertEquals("old context", database.conversations.loadModelContext(child.id).summaryCheckpoint?.summary)
        database.conversations.addCompressionCheckpoint(
            CompressionCheckpointRecord("cp-child", fixture.thread.id, child.id, fixture.profile.id, "child context", second.id, 12, 21),
        )
        database.conversations.addCompressionCheckpoint(
            CompressionCheckpointRecord("cp-main-late", fixture.thread.id, fixture.mainBranch.id, fixture.profile.id, "late parent context", second.id, 12, 30),
        )
        assertEquals("late parent context", database.conversations.loadModelContext(fixture.mainBranch.id).summaryCheckpoint?.summary)
        assertEquals("child context", database.conversations.loadModelContext(child.id).summaryCheckpoint?.summary)
        assertTrue(
            database.conversations.loadDisplayConversation(child.id)
                .filterIsInstance<DisplayConversationEntry.SummaryNotification>()
                .none { it.checkpoint.id == "cp-main-late" },
        )
        assertFailsWith<Throwable> {
            database.conversations.addCompressionCheckpoint(
                CompressionCheckpointRecord("cp-invalid", fixture.thread.id, child.id, fixture.profile.id, "invalid", third.id, 1, 22),
            )
        }
        Unit
    }

    @Test
    fun sideChatIsSoftArchivedAndRestorable() = withDatabase { database ->
        val fixture = fixture(database)
        val first = turn("t1", "first")
        database.conversations.appendTurn(fixture.mainBranch.id, first, 10)
        val side = database.branches.forkBranch(fixture.thread.id, fixture.mainBranch.id, first.id, "side", BranchKind.SIDE_CHAT, 11)
        database.conversations.appendTurn(side.id, turn("side-t1", "private"), 12)
        database.branches.archive(side.id, 13)
        assertTrue(database.branches.list(fixture.thread.id).none { it.id == side.id })
        assertEquals(side.id, database.branches.list(fixture.thread.id, includeArchived = true).single { it.id == side.id }.id)
        assertEquals(listOf("t1", "side-t1"), database.conversations.lineage(side.id).map { it.id })
        assertFailsWith<Throwable> { database.queue.enqueue(side.id, "closed", fixture.profile.id, 4096, "q-closed", 14) }
        database.branches.restore(side.id, 15)
        assertTrue(database.branches.list(fixture.thread.id).any { it.id == side.id })
    }

    @Test
    fun terminalRunUpdatesRequestAndAllowsSideChatArchive() = withDatabase { database ->
        val fixture = fixture(database)
        val first = database.conversations.appendTurn(fixture.mainBranch.id, turn("t1", "first"), 10)
        val side = database.branches.forkBranch(
            fixture.thread.id,
            fixture.mainBranch.id,
            first.id,
            "side-terminal",
            BranchKind.SIDE_CHAT,
            11,
        )
        val request = database.queue.enqueue(side.id, "question", fixture.profile.id, 4096, "q-side", 12)
        val run = database.runs.create(side.id, request.id, "run-side", 13)
        database.runs.update(run.copy(status = RunStatus.COMPLETED, finishedAt = 14), now = 14)
        assertEquals(QueueStatus.COMPLETED, database.queue.get(request.id).status)
        database.branches.archive(side.id, 15)
        assertEquals(15, database.branches.get(side.id).archivedAt)
    }

    @Test
    fun providersPluginsSettingsAndMalformedJsonAreExplicit() = withDatabase { database ->
        val fixture = fixture(database)
        database.settings.put("ui", "{\"density\":\"compact\"}", 1)
        assertEquals("{\"density\":\"compact\"}", database.settings.get("ui"))
        assertFailsWith<Throwable> { database.settings.put("broken", "{", 2) }
        val plugin = PluginRecord("plugin", "{\"id\":\"plugin\"}", "installed", "/plugins/plugin", null, false, 1, 1)
        database.plugins.upsert(plugin)
        database.plugins.putState(plugin.id, "enabled", "true", 2)
        assertEquals("true", database.plugins.getState(plugin.id, "enabled"))
        assertEquals(fixture.provider.id, database.providers.get(fixture.provider.id).id)
        database.driver.exec("UPDATE app_settings SET value_json = '{' WHERE key = 'ui'")
        assertFailsWith<Throwable> { database.settings.get("ui") }
        assertNull(database.settings.get("missing"))
    }

    @Test
    fun koaksTurnWireCodecRoundTripsCheckpointAndRejectsMalformedInput() {
        val items = listOf(ModelItem.user("question"), ModelItem.assistant("answer"))
        val turn = ConversationTurn(
            id = "wire-turn",
            status = TurnStatus.Completed,
            items = items,
            checkpoint = ProviderCheckpoint(ProviderId("provider"), 1, TranscriptBasis.of(items), CheckpointScope.CrossTurn, "opaque".encodeUtf8()),
            usage = Usage(promptTokens = 2, completionTokens = 3, totalTokens = 5),
        )
        assertEquals(turn, ConversationTurnCodec.decode(ConversationTurnCodec.encode(turn)))
        assertFailsWith<Throwable> { ConversationTurnCodec.decode("{\"id\":\"broken\"}") }
    }

    private fun <T> withDatabase(block: (PersistenceDatabase) -> T): T {
        val database = freshPersistenceDatabase()
        return try {
            block(database)
        } finally {
            database.close()
        }
    }

    private data class Fixture(
        val project: ProjectRecord,
        val provider: ProviderRecord,
        val profile: ModelProfileRecord,
        val thread: ThreadRecord,
        val mainBranch: BranchRecord,
    )

    private fun fixture(database: PersistenceDatabase, prefix: String = "main"): Fixture {
        val project = ProjectRecord("project-$prefix", "Project", "/tmp/project-$prefix", 1, 1, null)
        val provider = ProviderRecord("provider-$prefix", "Provider", "test", "test", "http://localhost", "ciphertext", 4096, true, 1, 1, null)
        val profile = ModelProfileRecord("profile-$prefix", provider.id, "Profile", "model", 4096, "test", true, 1, 1)
        val thread = ThreadRecord("thread-$prefix", project.id, "Thread", profile.id, "default", 4096, 1, 1, null)
        val branch = BranchRecord("branch-$prefix", thread.id, null, null, null, BranchKind.MAIN, false, null, 1, 1)
        database.projects.create(project)
        database.providers.create(provider)
        database.providers.createModelProfile(profile)
        database.threads.createWithMainBranch(thread, branch)
        return Fixture(project, provider, profile, thread, branch)
    }

    private fun otherFixture(database: PersistenceDatabase): Fixture = fixture(database, "other")

    private fun turn(id: String, text: String): ConversationTurn = ConversationTurn(
        id = id,
        status = TurnStatus.Completed,
        items = listOf(ModelItem.user(text), ModelItem.assistant("$text answer")),
    )
}
