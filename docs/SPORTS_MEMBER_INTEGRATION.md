# Sports Prediction Lab: member integration

Assessment: 2026-09-12. This is a design based on the current local checkout,
not a claim that a sports service has been published or its models qualified.

## Recommendation

Keep Edge Games as the member-facing website and authorization authority. Reuse
the Python lab behind a small private service with an explicit list of operations.
Start with read-only published forecasts and results. Add controlled prediction
and exploration jobs after the read path and service isolation are verified.

The first release should export the existing reader's sanitized results from the
computer to a private, versioned data directory on Tower. Edge Games can then
serve those results through a membership-checked API without exposing the desktop
SQL Server or making the website depend on the computer staying awake. Store
these files outside `public/`; all reads and downloads must pass `requireMember`.
Show generation time, sport/date coverage, provenance, and an explicit stale or
unavailable state. Replace exports atomically, validate the payload schema and
digest, and retain a last-known-good export. Never publish it to GitHub.

For interactive prediction tools, put a dedicated Python API/worker container on
Tower's private application network. Only Edge Games should be able to call it,
using service authentication. Expose fixed operations such as supported
sport/date forecasts, approved model comparisons, and bounded scenarios.
Recheck membership for every request, result poll, and download. Queue long jobs,
enforce per-member quotas and concurrency limits, bind jobs/results to the member,
and check current membership when jobs execute. Do not accept arbitrary scripts,
model paths, SQL, shell commands, or a user-supplied upstream URL.

## What was found locally

Source checkout: `E:\AI-Workspace\10-Projects\GitHubPersonal\Private\sports-prediction-lab`.

| Existing component | Useful role | Boundary to preserve |
| --- | --- | --- |
| `run_ui.py` and `app/streamlit_app.py` | Full research dashboard | Includes write and operations controls; retain for the owner |
| `run_public_site.py` and `app/public_website.py` | Existing read-only Forecast Ledger UI | Launcher deliberately binds loopback; it is not member authorization |
| `src/serving/public_reader.py` | First adapter/export source: `load_public_slate`, `list_public_dates` | Read-only settings, sanitized output, verified champion history, explicit unavailable states |
| `src/serving/live_prediction.py` | Later prediction worker | Reuse serving eligibility and chronology checks; distinguish research results |
| `src/serving/model_explorer.py`, `model_panel.py`, `model_workbench.py` | Later model and scenario tools | Research output must remain separate from published forecasts |
| `src/serving/operations.py` | Owner-only maintenance | Registered script execution and high-impact controls must not be exposed to members |
| `config.yaml` | Current storage integration | Both storage and historical data source select SQL Server; no connectivity or credentials were changed |

The reader supports explicit `available`, `unsupported`, `model_unavailable`,
`no_predictions`, and `data_unavailable` states. Its read-only settings remove
write scopes. Forecasts are checked against verified champion intervals and
pregame provenance. MLB and NFL are the initial supported live sports in the
serving code. This assessment did not query private prediction data or verify
whether a current champion is eligible; the deployed adapter must report the
reader's actual status without fallback to synthetic or research forecasts.

## Why not link to or embed the existing dashboard?

A hidden link does not secure its destination. The current Streamlit dashboard
also includes owner operations and uses the lab's database configuration. Exposing
that whole process would grant a much broader surface than the member tools.
Streamlit uses WebSocket sessions, so a secure proxy must cover connection setup,
HTTP resources, and ongoing revocation. Its OIDC support identifies users but
does not itself implement this website's invitation membership policy.

An isolated, reduced Streamlit reader behind a fully protected proxy is possible
as a shortcut. It adds a second UI/session layer, WebSocket revocation work, and
desktop/database availability concerns. A native member UI plus the existing
Python read/compute functions is the better long-term fit for multiple tools.
The export-first read release is the smallest useful step toward that design.

## Delivery stages and acceptance

1. **Membership foundation (this change):** invitation enrollment, member login,
   private collection, owner member management, password reset codes, and a
   clearly unavailable sports placeholder.
2. **Reader release:** build an exporter in the private sports repository;
   validate read-only operation and existing reader contracts; add a private
   ingestion/data directory and membership-checked sports API in Edge Games;
   render actual results with timestamps and unavailable/stale states. Verify
   anonymous, public-player, and suspended accounts cannot retrieve any payload.
3. **Interactive tools:** define the precise member operations, package the
   Python worker, provision least-privilege data access, and implement private
   member-owned jobs and status. Do not change the lab's current database
   authority or automate training/publication as a side effect of this work.
4. **Production checks:** rehearse database changes, verify failure behavior when
   the computer/service is offline, test suspension during a job, and check both
   desktop and phone flows. Preserve all locked scoring, chronology, leakage,
   model qualification, and publication gates.

No sports code was copied into this public repository. No sports server was
exposed, no model run was started, and no training or database settings changed.

Official references reviewed for this design:
[Streamlit authentication](https://docs.streamlit.io/develop/concepts/connections/authentication),
[client/server architecture](https://docs.streamlit.io/develop/concepts/architecture/architecture),
and [server configuration](https://docs.streamlit.io/develop/api-reference/configuration/config.toml).
