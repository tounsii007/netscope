# netscope CLI

Single static Go binary for scripting NetScope from a terminal or CI.

## Install

```bash
go install github.com/netscope/cli@latest
# or build locally:
cd cli && go build -o netscope .
```

## Configure

```bash
export NETSCOPE_API_KEY=netscope_live_xxx
export NETSCOPE_API_URL=https://api.netscope.io   # optional
```

## Examples

```bash
netscope port google.com 443
netscope dns example.com --type A,MX,TXT
netscope ssl github.com
netscope headers https://example.com
netscope ip 1.1.1.1
netscope reach api.mydomain.com --port 443
netscope audit mydomain.com
```

## Exit codes

- `0` — success
- `1` — API error (connection, 4xx/5xx)
- `2` — argument error

Use in bash scripts:

```bash
if ! netscope reach api.mydomain.com; then
  echo "Healthcheck failed — paging oncall" | slack-notify
  exit 1
fi
```
