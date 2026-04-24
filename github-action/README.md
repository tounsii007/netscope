# netscope/audit — GitHub Action

Run NetScope audits on every push. Fail the build when HTTP security headers
regress or an SSL cert is about to expire.

## Usage

```yaml
- uses: netscope/audit@v1
  with:
    target: mysite.com
    api-key: ${{ secrets.NETSCOPE_API_KEY }}
    fail-below: B              # fail if below grade B
    fail-on-ssl-days: "14"     # fail if cert expires in <14 days
```

## Outputs

- `header-grade` — A+..F
- `ssl-grade` — A+..F
- `ssl-days-left` — days to expiry

## Example: daily audit

```yaml
on:
  schedule:
    - cron: '0 6 * * *'
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: netscope/audit@v1
        with:
          target: ${{ vars.SITE_DOMAIN }}
          api-key: ${{ secrets.NETSCOPE_API_KEY }}
          fail-below: A
```
