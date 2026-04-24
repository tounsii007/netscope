// Package main implements the `netscope` CLI — a single statically-linked binary
// that wraps the NetScope REST API. Use for ad-hoc checks, CI pipelines and
// scripting. Reads NETSCOPE_API_KEY + NETSCOPE_API_URL from the environment.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	var err error
	switch cmd {
	case "port":
		err = cmdPort(args)
	case "dns":
		err = cmdDNS(args)
	case "ssl":
		err = cmdSSL(args)
	case "headers":
		err = cmdHeaders(args)
	case "ip":
		err = cmdIP(args)
	case "reach":
		err = cmdReach(args)
	case "audit":
		err = cmdAudit(args)
	case "version", "-v", "--version":
		fmt.Println("netscope", version)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintln(os.Stderr, "unknown command:", cmd)
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, `netscope %s — network diagnostics CLI

Usage:
  netscope <command> [flags]

Commands:
  port <host> <port>         Check a single TCP port
  dns <domain> [--type A,MX] Lookup DNS records
  ssl <host> [--port 443]    Inspect SSL certificate
  headers <url>              Grade HTTP security headers A+..F
  ip <ip>                    Geo + ASN + threat intel
  reach <host> [--port 443]  HTTP + TCP + ping reachability
  audit <host>               Combined ports + ssl + headers + ip

Environment:
  NETSCOPE_API_URL  (default: https://api.netscope.io)
  NETSCOPE_API_KEY  API key for authenticated + higher rate limits

Examples:
  netscope port google.com 443
  netscope headers https://example.com
  netscope audit mydomain.com --json
`, version)
}

func apiBase() string {
	v := os.Getenv("NETSCOPE_API_URL")
	if v == "" {
		return "https://api.netscope.io"
	}
	return strings.TrimRight(v, "/")
}

func do(method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, apiBase()+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if k := os.Getenv("NETSCOPE_API_KEY"); k != "" {
		req.Header.Set("X-API-Key", k)
	}
	req.Header.Set("User-Agent", "netscope-cli/"+version)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return errors.New(string(b))
	}
	if out != nil {
		return json.Unmarshal(b, out)
	}
	return nil
}

func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

func cmdPort(args []string) error {
	if len(args) < 2 {
		return errors.New("usage: netscope port <host> <port>")
	}
	var out map[string]any
	err := do("POST", "/api/v1/port/check",
		map[string]any{"target": args[0], "port": mustInt(args[1]), "protocol": "tcp"}, &out)
	if err != nil {
		return err
	}
	if open, _ := out["open"].(bool); open {
		fmt.Printf("✓ %s:%v OPEN", out["resolvedIp"], out["port"])
		if lat, ok := out["latencyMs"].(float64); ok {
			fmt.Printf(" (%vms)", int(lat))
		}
		if svc, _ := out["service"].(string); svc != "" {
			fmt.Printf(" [%s]", svc)
		}
		fmt.Println()
	} else {
		fmt.Printf("✗ %s:%v CLOSED", out["resolvedIp"], out["port"])
		if e, _ := out["error"].(string); e != "" {
			fmt.Printf(" (%s)", e)
		}
		fmt.Println()
	}
	return nil
}

func cmdDNS(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope dns <domain> [--type A,MX]")
	}
	fs := flag.NewFlagSet("dns", flag.ExitOnError)
	typeFlag := fs.String("type", "A,AAAA,MX,TXT,NS", "comma-separated record types")
	fs.Parse(args[1:])

	var out map[string]any
	err := do("GET", "/api/v1/dns/"+url.PathEscape(args[0])+"?type="+*typeFlag, nil, &out)
	if err != nil {
		return err
	}
	records, _ := out["records"].(map[string]any)
	for t, v := range records {
		arr, _ := v.([]any)
		fmt.Printf("%s (%d)\n", t, len(arr))
		for _, r := range arr {
			fmt.Printf("  %s\n", r)
		}
	}
	return nil
}

func cmdSSL(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope ssl <host> [--port 443]")
	}
	fs := flag.NewFlagSet("ssl", flag.ExitOnError)
	port := fs.Int("port", 443, "TLS port")
	fs.Parse(args[1:])
	var out map[string]any
	err := do("GET", fmt.Sprintf("/api/v1/ssl/%s?port=%d", url.PathEscape(args[0]), *port), nil, &out)
	if err != nil {
		return err
	}
	return printJSON(out)
}

func cmdHeaders(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope headers <url>")
	}
	var out map[string]any
	err := do("GET", "/api/v1/headers?url="+url.QueryEscape(args[0]), nil, &out)
	if err != nil {
		return err
	}
	fmt.Printf("Grade %s (%v/100) — %s\n", out["grade"], out["score"], out["url"])
	checks, _ := out["checks"].([]any)
	for _, c := range checks {
		m := c.(map[string]any)
		mark := "✗"
		good, _ := m["good"].(bool)
		present, _ := m["present"].(bool)
		if good {
			mark = "✓"
		} else if present {
			mark = "~"
		}
		fmt.Printf("  %s %s\n", mark, m["header"])
	}
	return nil
}

func cmdIP(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope ip <ip>")
	}
	var out map[string]any
	err := do("GET", "/api/v1/ip/"+url.PathEscape(args[0]), nil, &out)
	if err != nil {
		return err
	}
	return printJSON(out)
}

func cmdReach(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope reach <host> [--port 443]")
	}
	fs := flag.NewFlagSet("reach", flag.ExitOnError)
	port := fs.Int("port", 443, "port")
	fs.Parse(args[1:])
	var out map[string]any
	err := do("POST", "/api/v1/reach/check",
		map[string]any{"target": args[0], "port": *port, "method": "auto"}, &out)
	if err != nil {
		return err
	}
	return printJSON(out)
}

func cmdAudit(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: netscope audit <host>")
	}
	host := args[0]
	fmt.Println("Auditing", host)
	steps := []struct {
		name string
		fn   func() error
	}{
		{"headers", func() error { return cmdHeaders([]string{"https://" + host}) }},
		{"ssl", func() error { return cmdSSL([]string{host}) }},
		{"reach", func() error { return cmdReach([]string{host}) }},
	}
	for _, s := range steps {
		fmt.Println("\n=== " + s.name + " ===")
		if err := s.fn(); err != nil {
			fmt.Fprintln(os.Stderr, "!", s.name, "failed:", err)
		}
	}
	return nil
}

func mustInt(s string) int {
	var i int
	if _, err := fmt.Sscanf(s, "%d", &i); err != nil {
		fmt.Fprintln(os.Stderr, "not a number:", s)
		os.Exit(2)
	}
	return i
}
