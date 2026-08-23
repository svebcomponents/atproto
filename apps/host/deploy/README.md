# Deploy & operations notes

Operational knowledge for running the hosted bridge
(`atproto.svebcomponents.dev`). The user-facing statements these notes back up
live on [`/privacy`](../src/routes/privacy/+page.svelte) — if you change what
the service stores, logs, or where it runs, that page has to change with it.

## VM

The server runs on an exe.dev VM in **Tokyo, Japan** (region confirmed in the
exe.dev account settings, August 2026). Japan holds an EU adequacy decision,
which is why the privacy page can state that EU→EEA transfers need no
additional safeguard.

If the VM is ever moved: Frankfurt is the other clean answer (inside the EEA).
Most other regions require rewriting the "Where the bridge runs" section around
the transfer safeguard actually relied on.

## journald retention

The service itself writes no access log and makes no console calls; adapter-node
prints only two startup lines. Diagnostic output (crashes, restarts) goes to the
system journal. Cap its retention once per VM so it cannot accumulate forever —
this is what lets the privacy page promise 30-day disposal:

```sh
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=30day\n' \
  | sudo tee /etc/systemd/journald.conf.d/retention.conf
sudo systemctl restart systemd-journald
```

## Controller identity & EU representative (GDPR Art. 27)

Basis for what the privacy page does and does not say under "Who is
responsible":

- GDPR Art. 13(1)(a) asks for the controller's identity and contact details; a
  name plus a monitored mailbox satisfies it. A postal address is an Impressum
  requirement (§ 5 DDG, ECG) tied to where the operator is established — Japan,
  in this case — not to where readers are.
- Art. 27 can require a non-EU controller to appoint an EU representative. The
  operator assesses this service as falling within the Art. 27(2)(a)
  exemption: processing is low-risk and minimal (no special categories, no
  profiling, no advertising, no comment content stored, nothing written to
  disk for readers who don't sign in, identifiers limited to public profile
  parts). Reassess if retention grows or usage scales past "occasional"; if a
  representative is ever appointed, name them on the privacy page.
