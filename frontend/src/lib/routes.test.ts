import { describe, expect, it } from "vitest";

import { routeTable } from "@/test/fixtures";

import { djangoPath, isFormRoute, toRoute } from "./routes";

describe("toRoute", () => {
  it("maps a Django page to its React route and fills in the parameters", () => {
    expect(toRoute("/risks/12/", routeTable)).toBe("/risks/12");
    expect(toRoute("/risks/12/edit/", routeTable)).toBe("/risks/12/edit");
    expect(toRoute("/workflow/risks/3/transition/start_treatment/", routeTable)).toBe(
      "/workflow/risks/3/transition/start_treatment",
    );
  });

  it("keeps the query and the section of the page", () => {
    expect(toRoute("/risks/coverage/1/2/?next=%2Frisks%2Fcoverage%2F", routeTable)).toBe(
      "/risks/coverage/1/2?next=%2Frisks%2Fcoverage%2F",
    );
    expect(toRoute("/risks/1/#comments", routeTable)).toBe("/risks/1#comments");
  });

  it("accepts absolute links on this site, and nothing from another origin", () => {
    expect(toRoute(`${window.location.origin}/risks/evidence/`, routeTable)).toBe("/risks/evidence");
    expect(toRoute("https://evil.example.test/risks/1/", routeTable)).toBeNull();
    expect(toRoute("//evil.example.test/risks/1/", routeTable)).toBeNull();
  });

  it("leaves pages that only Django has to Django", () => {
    expect(toRoute("/catalog/services/", routeTable)).toBeNull();
    expect(toRoute("/risks/1/extra/", routeTable)).toBeNull();
    expect(toRoute(null, routeTable)).toBeNull();
    expect(toRoute("", routeTable)).toBeNull();
  });

  it("skips a broken pattern instead of failing every link", () => {
    const table = [{ name: "bad", pattern: "^/(?<oops", route: "/x", form: false }, ...routeTable];
    expect(toRoute("/risks/1/", table)).toBe("/risks/1");
  });
});

describe("djangoPath and isFormRoute", () => {
  it("adds back the trailing slash Django expects and keeps the query", () => {
    expect(djangoPath({ pathname: "/risks/1/edit", search: "" })).toBe("/risks/1/edit/");
    expect(djangoPath({ pathname: "/risks/evidence", search: "?kind=test" })).toBe("/risks/evidence/?kind=test");
    expect(djangoPath({ pathname: "/risks/", search: "" })).toBe("/risks/");
  });

  it("knows which routes are Django forms", () => {
    expect(isFormRoute("/risks/1/edit", routeTable)).toBe(true);
    expect(isFormRoute("/risks/1", routeTable)).toBe(false);
    expect(isFormRoute("/nowhere", routeTable)).toBe(false);
  });
});
