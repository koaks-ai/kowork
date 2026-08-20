package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public data class ApprovalRecord(
    val id: String,
    val projectId: String,
    val threadId: String,
    val branchId: String,
    val runId: String,
    val kind: String,
    val title: String,
    val detail: String,
    val status: String,
    val requestedPath: String?,
    val requestedAccess: String?,
    val createdAt: Long,
    val resolvedAt: Long?,
)

public class ApprovalRepository(private val database: PersistenceDatabase) {
    public fun create(approval: ApprovalRecord) {
        requireNonBlank(approval.id, "approval.id")
        requireNonBlank(approval.kind, "approval.kind")
        val branch = database.branches.get(approval.branchId)
        val thread = database.threads.get(approval.threadId)
        val run = database.runs.get(approval.runId)
        require(branch.threadId == approval.threadId && thread.projectId == approval.projectId) {
            "Approval project, thread and branch do not match"
        }
        require(run.branchId == approval.branchId && run.threadId == approval.threadId) {
            "Approval run belongs to another branch"
        }
        require(approval.status == "pending") { "A new approval must be pending" }
        database.driver.exec(
            "INSERT INTO approvals(id, project_id, thread_id, branch_id, run_id, kind, title, detail, status, requested_path, requested_access, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            13,
        ) {
            bindString(0, approval.id); bindString(1, approval.projectId); bindString(2, approval.threadId); bindString(3, approval.branchId)
            bindString(4, approval.runId); bindString(5, approval.kind); bindString(6, approval.title); bindString(7, approval.detail)
            bindString(8, approval.status); bindNullableString(9, approval.requestedPath); bindNullableString(10, approval.requestedAccess)
            bindLong(11, approval.createdAt); bindNullableLong(12, approval.resolvedAt)
        }
    }

    public fun resolve(id: String, status: String, resolvedAt: Long): ApprovalRecord {
        require(status != "pending" && status.isNotBlank()) { "Resolved approval status must be terminal" }
        require(get(id).status == "pending") { "Approval '$id' is already resolved" }
        database.driver.exec("UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'", 3) {
            bindString(0, status); bindLong(1, resolvedAt); bindString(2, id)
        }
        return get(id)
    }

    public fun get(id: String): ApprovalRecord = database.driver.query(
            "SELECT id, project_id, thread_id, branch_id, run_id, kind, title, detail, status, requested_path, requested_access, created_at, resolved_at FROM approvals WHERE id = ?",
            1, { bindString(0, id) },
            { cursor -> cursor.nextOrFail("approval $id"); QueryResult.Value(cursor.toApproval()) },
        )
}

internal fun app.cash.sqldelight.db.SqlCursor.toApproval(): ApprovalRecord = ApprovalRecord(
    id = string(0, "approval.id"), projectId = string(1, "approval.projectId"), threadId = string(2, "approval.threadId"),
    branchId = string(3, "approval.branchId"), runId = string(4, "approval.runId"), kind = string(5, "approval.kind"),
    title = string(6, "approval.title"), detail = string(7, "approval.detail"), status = string(8, "approval.status"),
    requestedPath = nullableString(9), requestedAccess = nullableString(10), createdAt = long(11, "approval.createdAt"), resolvedAt = nullableLong(12),
)
