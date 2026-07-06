import { describe, it, expect } from "vitest";
import { selectGranteesToRevoke } from "./team-grants-logic";

describe("selectGranteesToRevoke", () => {
  it("revokes nobody when every grantee is still authorized", () => {
    expect(selectGranteesToRevoke(["a", "b"], ["a", "b"], "owner")).toEqual([]);
  });

  it("revokes a grantee who is no longer authorized", () => {
    expect(selectGranteesToRevoke(["a", "b"], ["a"], "owner")).toEqual(["b"]);
  });

  it("never revokes the owner, even if absent from the authorized set", () => {
    expect(selectGranteesToRevoke(["owner", "a"], [], "owner")).toEqual(["a"]);
  });

  it("keeps a grantee still authorized via a second (overlapping) team", () => {
    // `b` remains authorized through another linked team → not revoked.
    expect(selectGranteesToRevoke(["a", "b"], ["b"], "owner")).toEqual(["a"]);
  });

  it("is a no-op when there are no grantees", () => {
    expect(selectGranteesToRevoke([], ["a"], "owner")).toEqual([]);
  });

  it("revokes all grantees when none remain authorized (owner still kept)", () => {
    expect(selectGranteesToRevoke(["owner", "a", "b"], [], "owner")).toEqual(["a", "b"]);
  });
});
