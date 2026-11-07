import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkRoutes, extractRoutes } from "./check-route-layouts.mjs";

const SRC = `<Routes><Route element={<Shell />}>
  <Route index element={<A />} />
  <Route path="pricing" element={<B />} />
  <Route path=":hub" element={<L />}>
    <Route index element={<C />} />
    <Route path="campaigns/:id" element={<D />} />
  </Route>
  <Route path="*" element={<N />} />
  {import.meta.env.DEV && <Route path="__gallery" element={<G />} />}
</Route></Routes>`;

test("extracts full paths, nests under a Hub, and skips the dev gallery", () => {
  assert.deepEqual(extractRoutes(SRC).sort(), ["*", "/", "/:hub", "/:hub/campaigns/:id", "/pricing"].sort());
});

test("reports a route with no entry and an entry with no route", () => {
  const reg = { routes: ["/", "/pricing", "/:hub", "/gone", "*"].map((path) => ({ path, layout: "L1" })) };
  const problems = checkRoutes(SRC, reg);
  assert.ok(problems.some((p) => p.includes("/:hub/campaigns/:id has no entry")));
  assert.ok(problems.some((p) => p.includes("lists /gone")));
});

test("rejects an unknown layout", () => {
  const reg = { routes: ["/", "/pricing", "/:hub", "/:hub/campaigns/:id", "*"].map((path) => ({ path, layout: "L99" })) };
  assert.ok(checkRoutes(SRC, reg).some((p) => p.includes("unknown layout")));
});
