// Server-side entry of the sources module. Client code imports ./client; the public pages import ./public (nothing else of this module).
import "server-only";

export * from "./client";
export { SOURCE_ERROR_TEXT, SourceError, sourceDbError, type SourceErrorCode } from "./errors";
export { createSupabaseSourcesRepo, type SourcesRepo } from "./repo";
export {
  appendDatedNote, archiveSource, getSource, listSources, restoreSource, saveSource, updateSource,
  type SaveSourceInput, type SaveSourceResult, type UpdateSourceInput,
} from "./service";
export { createSourceFiling, type SourceFiling } from "./filing";
export {
  buildStudiedEntries, MAX_STUDIED, readStudied, readStudiedForm, STUDIED_KEY, STUDIED_NOTE_MAX, studiedEntrySchema, studiedStructured, withStudied,
  type StudiedEntry, type StudiedFile, type StudiedRow,
} from "./studied";
export {
  COOLDOWN_MS, fetchPendingSources, isPending, PUMP_BATCH, PUMP_BUDGET_MS, readSourceNow, RECHECK_BATCH, RECHECK_BUDGET_MS, recheckSources,
  type FetchDeps, type FetchStore, type ReadNowAnswer, type RecordFetch, type SourceRef,
} from "./fetch";
export { buildStudiedCards, studiedByItem, type PublicStudiedRow, type StudiedCard } from "./public";
