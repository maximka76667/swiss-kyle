# Wiki Log

Append-only. Claude writes one entry per operation. Do not edit manually.

---

<!-- Format:
[YYYY-MM-DD] OPERATION source/path → created: [pages] | updated: [pages]
-->

[2026-06-22] BOOTSTRAP docs/DESIGN.md, src/lib.rs, src/bin/subscriber.rs, src/bin/publisher.rs, src/bin/api.rs → created: wiki/architecture/system-overview, wiki/components/job-types, wiki/components/publisher, wiki/components/worker, wiki/components/cli-publisher, wiki/components/http-api, wiki/decisions/adr-001-local-only, wiki/decisions/adr-002-keep-nats-for-durability, wiki/decisions/adr-003-embedded-surrealdb, wiki/concepts/jetstream-pull-consumer, wiki/dependencies/async-nats, wiki/dependencies/axum, wiki/issues/missing-db-and-progress, wiki/issues/api-rs-obsolescence | updated: wiki/index.md

[2026-06-28] UPDATE crates/shared/src/lib.rs, crates/worker/src/main.rs, src-tauri/src/lib.rs, src-tauri/src/video_server.rs, swiss-kyle-ui/ (3 commits: JobEnvelope+id, StatusEvents, VideoPlayer) → created: wiki/components/tauri-app, wiki/components/video-server, wiki/components/frontend | updated: wiki/components/job-types (added JobEnvelope/JobStatus/StatusEvent), wiki/components/worker (progress parsing, StatusEvent publishing, graceful error handling), wiki/issues/missing-db-and-progress (progress now done; DB still missing), wiki/issues/api-rs-obsolescence (resolved), wiki/index.md
