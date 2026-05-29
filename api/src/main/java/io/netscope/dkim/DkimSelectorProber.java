package io.netscope.dkim;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.function.BiFunction;

/**
 * Parallel selector probe with streaming first-match semantics.
 *
 * Fans out one DNS query per candidate selector across a virtual-thread
 * pool, then walks the futures in canonical order and returns the first
 * one whose result reports {@code present=true}. Remaining futures are
 * cancelled so a slow tail can't pin a virtual thread.
 *
 * Latency: best case ≈ first-selector RTT (~50 ms when the canonical
 * winner resolves quickly); worst case ≈ BoundedDns cap (~3 s when
 * none of the probed selectors publish a record).
 */
public final class DkimSelectorProber {
    private DkimSelectorProber() {}

    public record Outcome(
        String winningSelector,
        Map<String, Object> winningResult,
        List<String> triedSelectors
    ) {}

    /**
     * @param domain               the apex domain being probed
     * @param candidateSelectors   list to attempt (canonical order)
     * @param fetcher              per-selector lookup, returns a map with
     *                             {@code present:true|false}
     * @param pool                 executor for parallel dispatch
     */
    public static Outcome findFirstMatch(
            String domain,
            List<String> candidateSelectors,
            BiFunction<String, String, Map<String, Object>> fetcher,
            ExecutorService pool) {

        List<CompletableFuture<Map.Entry<String, Map<String, Object>>>> futures =
            new ArrayList<>(candidateSelectors.size());
        for (String s : candidateSelectors) {
            futures.add(CompletableFuture.supplyAsync(
                () -> Map.entry(s, fetcher.apply(domain, s)), pool));
        }

        List<String> tried = new ArrayList<>(futures.size());
        for (int i = 0; i < futures.size(); i++) {
            String selectorAtI = candidateSelectors.get(i);
            try {
                Map.Entry<String, Map<String, Object>> e = futures.get(i).get();
                tried.add(e.getKey());
                if (Boolean.TRUE.equals(e.getValue().get("present"))) {
                    for (int j = i + 1; j < futures.size(); j++) {
                        futures.get(j).cancel(true);
                    }
                    return new Outcome(e.getKey(), e.getValue(), tried);
                }
            } catch (Exception ignored) {
                tried.add(selectorAtI);
            }
        }
        return new Outcome(null, null, tried);
    }
}
