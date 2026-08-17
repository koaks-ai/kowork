import type {
  AppBootstrapDto,
  AppSettingsDto,
  ApprovalDto,
  FileContentDto,
  FileEntryDto,
  GitChangeDto,
  GitDiffDto,
  GitSummaryDto,
  ModelProfileDto,
  ModelRefreshResultDto,
  ProjectDto,
  ProviderCreateRequest,
  ProviderDto,
  ProviderUpdateRequest,
  QueuedRequestDto,
  RunDto,
  RunEventDto,
  ThreadDto
} from './models'
import type { HostPlatformInfo } from './platform'

export interface KoWorkApi {
  platform: HostPlatformInfo
  bootstrap(): Promise<AppBootstrapDto>
  projects: {
    list(includeDeleted?: boolean): Promise<ProjectDto[]>
    add(): Promise<ProjectDto | null>
    archive(projectId: string): Promise<ProjectDto>
    restore(projectId: string): Promise<ProjectDto>
  }
  threads: {
    list(projectId: string, includeDeleted?: boolean): Promise<ThreadDto[]>
    create(projectId: string, title?: string): Promise<ThreadDto>
    update(
      threadId: string,
      changes: Partial<
        Pick<ThreadDto, 'title' | 'modelProfileId' | 'permissionMode' | 'contextWindowTokens'>
      >
    ): Promise<ThreadDto>
    archive(threadId: string): Promise<ThreadDto>
    restore(threadId: string): Promise<ThreadDto>
  }
  runs: {
    enqueue(threadId: string, input: string): Promise<QueuedRequestDto>
    cancel(runId: string): Promise<RunDto>
    resumeQueue(threadId: string): Promise<ThreadDto>
    removeQueued(requestId: string): Promise<QueuedRequestDto>
    list(threadId: string): Promise<RunDto[]>
    queue(threadId: string): Promise<QueuedRequestDto[]>
  }
  events: {
    list(threadId?: string, afterSequence?: number): Promise<RunEventDto[]>
    subscribe(listener: (event: RunEventDto) => void): () => void
  }
  approvals: {
    list(threadId?: string, pendingOnly?: boolean): Promise<ApprovalDto[]>
    respond(approvalId: string, decision: 'allow' | 'deny'): Promise<ApprovalDto>
  }
  providers: {
    list(): Promise<ProviderDto[]>
    create(input: ProviderCreateRequest): Promise<ProviderDto>
    update(input: ProviderUpdateRequest): Promise<ProviderDto>
    archive(providerId: string): Promise<ProviderDto>
    refreshModels(providerId: string): Promise<ModelRefreshResultDto>
    addModel(
      providerId: string,
      model: string,
      contextWindowTokens: number,
      name?: string
    ): Promise<ModelProfileDto>
    archiveModel(modelProfileId: string): Promise<ModelProfileDto>
  }
  settings: {
    get(): Promise<AppSettingsDto>
    update(changes: Partial<AppSettingsDto>): Promise<AppSettingsDto>
  }
  files: {
    list(projectId: string, relativePath?: string): Promise<FileEntryDto[]>
    read(projectId: string, relativePath: string): Promise<FileContentDto>
  }
  git: {
    status(projectId: string): Promise<GitChangeDto[]>
    summary(projectId: string): Promise<GitSummaryDto>
    diff(projectId: string, relativePath?: string): Promise<GitDiffDto>
  }
}
