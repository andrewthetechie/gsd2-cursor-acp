# Roadmap: GSD-Cursor

## Overview

This roadmap delivers a Cursor ACP provider for GSD-2's pi-ai package. The build follows the natural dependency chain of the ACP protocol: first establish reliable JSON-RPC transport over stdio, then layer session and authentication management on top, then build the provider that translates between GSD-2's streaming interface and ACP's session/update notifications, then wire up model discovery and registration, and finally harden error handling and prove it all works end-to-end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: ACP Transport** - JSON-RPC over stdio to cursor agent acp with message correlation
- [ ] **Phase 2: Session & Authentication** - ACP lifecycle management and permission handling
- [ ] **Phase 3: Provider & Streaming** - CursorAcpProvider implementing ApiProvider with event translation
- [ ] **Phase 4: Model Discovery & Registration** - Dynamic model discovery and GSD-2 model registration
- [ ] **Phase 5: Hardening & Verification** - Error handling, unit tests, integration tests, documentation

## Phase Details

### Phase 1: ACP Transport
**Goal**: Reliable bidirectional JSON-RPC communication with the cursor agent acp child process
**Depends on**: Nothing (first phase)
**Requirements**: TRAN-01, TRAN-02, TRAN-03
**Success Criteria** (what must be TRUE):
  1. AcpTransport can spawn `cursor agent acp` as a child process and send/receive newline-delimited JSON-RPC messages over stdio
  2. Transport reuses a single long-lived child process across multiple requests (no re-spawn per call)
  3. Outgoing requests and incoming responses are correctly correlated by message ID, and notifications are routed separately
**Plans**: TBD

Plans:
- [ ] 01-01: AcpTransport and JSON-RPC types

### Phase 2: Session & Authentication
**Goal**: Users can authenticate with Cursor and the provider can manage ACP session lifecycle and permissions
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Provider authenticates using CURSOR_API_KEY env var or existing Cursor CLI login and completes the ACP initialize/authenticate handshake
  2. AcpSessionPool creates new sessions via session/new and reuses them for subsequent prompts
  3. Provider auto-responds to session/request_permission requests with configurable policy (default: allow-once)
  4. Permission policy is configurable between auto-approve-all, approve-reads-reject-writes, and interactive modes
**Plans**: TBD

Plans:
- [ ] 02-01: AcpSessionPool, authentication, and PermissionHandler

### Phase 3: Provider & Streaming
**Goal**: GSD-2 consumers can call stream() on the Cursor ACP provider and receive a properly-typed AssistantMessageEventStream
**Depends on**: Phase 2
**Requirements**: PROV-01, PROV-02, PROV-03, STRM-01, STRM-02, STRM-03, STRM-04
**Success Criteria** (what must be TRUE):
  1. CursorAcpProvider implements ApiProvider with stream() and streamSimple() methods that return AssistantMessageEventStream synchronously
  2. ACP session/update notifications are translated to correct GSD-2 events: text_delta, text_end, done, error for text content
  3. Tool call updates from Cursor are mapped to toolcall_start and toolcall_end events
  4. Thinking/reasoning content from the underlying model is extracted to thinking_start/thinking_delta/thinking_end events
  5. Cancellation via AbortSignal sends session/cancel to ACP and ends the stream cleanly
**Plans**: TBD

Plans:
- [ ] 03-01: EventTranslator pure functions
- [ ] 03-02: CursorAcpProvider and provider registration

### Phase 4: Model Discovery & Registration
**Goal**: Cursor models are dynamically discovered and registered in GSD-2's model system with proper metadata
**Depends on**: Phase 3
**Requirements**: MODL-01, MODL-02, MODL-03
**Success Criteria** (what must be TRUE):
  1. Provider queries Cursor CLI for available models at startup and registers them dynamically
  2. Each discovered model has metadata including context window, capabilities, and cost information
  3. GSD-2 canonical model IDs and ThinkingLevel settings map correctly to Cursor model variants
**Plans**: TBD

Plans:
- [ ] 04-01: ModelRegistry with dynamic discovery and canonical ID mapping

### Phase 5: Hardening & Verification
**Goal**: The provider handles all failure modes gracefully and is proven correct via tests and documentation
**Depends on**: Phase 4
**Requirements**: ERRH-01, ERRH-02, ERRH-03, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. When Cursor CLI is not installed, the provider reports a clear, actionable error message
  2. When authentication is expired or missing, the provider reports a specific auth error (not a generic failure)
  3. Session creation and prompt errors are mapped to GSD-2 error events with meaningful messages
  4. Unit tests cover EventTranslator, AcpTransport message handling, and AcpSessionPool lifecycle logic
  5. End-to-end tests prove the full ACP integration works with a real Cursor CLI
**Plans**: TBD

Plans:
- [ ] 05-01: Error handling across all components
- [ ] 05-02: Test suite and documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. ACP Transport | 0/1 | Not started | - |
| 2. Session & Authentication | 0/1 | Not started | - |
| 3. Provider & Streaming | 0/2 | Not started | - |
| 4. Model Discovery & Registration | 0/1 | Not started | - |
| 5. Hardening & Verification | 0/2 | Not started | - |
