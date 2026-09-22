import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitGaussianProcess, proposeExpectedImprovement } from "./gp.ts";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("Gaussian process surrogate", () => {
  it("interpolates noiseless observations in their original loss units", () => {
    const points = [[0], [0.2], [0.55], [0.8], [1]];
    const values = points.map(([x]) => 30 + 7 * Math.sin(x * 5));
    const model = fitGaussianProcess(points, values);
    points.forEach((point, i) => {
      const prediction = model.predict(point);
      assert.ok(Math.abs(prediction.mean - values[i]) < 1e-5);
      assert.ok(prediction.sigma < 1e-3);
    });
    assert.ok(model.lengthScale > 0);
    assert.ok(model.jitter > 0);
  });

  it("reports more uncertainty away from observed locations", () => {
    const model = fitGaussianProcess([[0.1], [0.2], [0.3]], [1.2, 0.8, 1]);
    assert.ok(model.predict([0.9]).sigma > model.predict([0.2]).sigma * 100);
    assert.ok(model.predict([0.9]).sigma > 0);
  });

  it("supports normalized multidimensional inputs without retaining mutable training data", () => {
    const points = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ];
    const values = [2, 1, 0];
    const model = fitGaussianProcess(points, values);
    const before = model.predict([0.2, 0.3]);
    points[0][0] = 1;
    values[0] = 999;
    assert.deepEqual(model.predict([0.2, 0.3]), before);
  });

  it("averages repeated observations and recognizes disagreement as noise", () => {
    const same = fitGaussianProcess([[0.5], [0.5]], [4, 4]);
    const conflicting = fitGaussianProcess([[0.5], [0.5]], [3, 5]);
    assert.equal(conflicting.predict([0.5]).mean, 4);
    assert.ok(conflicting.predict([0.5]).sigma > same.predict([0.5]).sigma);
    assert.ok(Number.isFinite(conflicting.predict([0.8]).sigma));
  });

  it("keeps repeated and constant-loss data finite and can propose a new location", () => {
    for (const constant of [0, 17, -1e8]) {
      const points = [[0.5], [0.5], [0.5 + 1e-12]];
      const values = [constant, constant, constant];
      const model = fitGaussianProcess(points, values);
      const prediction = model.predict([0.5]);
      assert.ok(Number.isFinite(prediction.mean));
      assert.ok(Number.isFinite(prediction.sigma));
      assert.ok(prediction.sigma >= 0);
      const proposal = proposeExpectedImprovement(points, values, () => 0.5);
      assert.ok(Number.isFinite(proposal.expectedImprovement));
      assert.ok(proposal.expectedImprovement > 0);
      // With zero predicted improvement, EI is exactly sigma times φ(0).
      assert.ok(
        Math.abs(proposal.expectedImprovement - proposal.sigma / Math.sqrt(2 * Math.PI)) <
          1e-6 * proposal.sigma,
      );
      assert.ok(points.every(([x]) => Math.abs(proposal.point[0] - x) > 1e-8));
    }
  });

  it("rejects empty, mismatched, nonfinite and out-of-bounds data", () => {
    assert.throws(() => fitGaussianProcess([], []), /nonempty/);
    assert.throws(() => fitGaussianProcess([[0]], []), /matching/);
    assert.throws(() => fitGaussianProcess([[]], [1]), /nonempty/);
    assert.throws(() => fitGaussianProcess([[0], [0, 1]], [1, 2]), /coordinates/);
    assert.throws(() => fitGaussianProcess([[1.1]], [1]), /coordinates/);
    assert.throws(() => fitGaussianProcess([[NaN]], [1]), /coordinates/);
    assert.throws(() => fitGaussianProcess([[0]], [Infinity]), /finite/);
    const model = fitGaussianProcess([[0]], [1]);
    assert.throws(() => model.predict([0, 1]), /coordinates/);
    assert.throws(() => model.predict([-1]), /coordinates/);
    assert.throws(() => proposeExpectedImprovement([[0]], [1], () => NaN), /random generator/);
  });
});

describe("expected improvement acquisition", () => {
  it("is deterministic for the same observations and random seed", () => {
    const points = [
      [0, 0],
      [1, 1],
      [0.3, 0.6],
    ];
    const values = [1, 2, 0.5];
    const first = proposeExpectedImprovement(points, values, seededRandom(42));
    const second = proposeExpectedImprovement(points, values, seededRandom(42));
    assert.deepEqual(first, second);
    assert.ok(first.point.every((x) => x >= 0 && x <= 1));
    assert.ok(first.expectedImprovement >= 0);
    assert.ok(first.sigma > 0);
    assert.ok(points.every((point) => point.some((x, i) => Math.abs(first.point[i] - x) > 1e-8)));
  });

  it("improves a known objective through sequential observations without duplicate proposals", () => {
    const objective = ([x]: number[]) => (x - 0.371) ** 2 + 0.025 * Math.sin(10 * x) ** 2;
    const points = [[0], [0.8], [1]];
    const values = points.map(objective);
    const initialBest = Math.min(...values);
    const rng = seededRandom(2718);
    for (let i = 0; i < 12; i++) {
      const next = proposeExpectedImprovement(points, values, rng);
      assert.ok(points.every(([x]) => Math.abs(next.point[0] - x) > 1e-8));
      assert.ok(Number.isFinite(next.mean));
      assert.ok(Number.isFinite(next.sigma));
      assert.ok(Number.isFinite(next.expectedImprovement));
      points.push(next.point);
      values.push(objective(next.point));
    }
    const referenceMinimum = Math.min(
      ...Array.from({ length: 10001 }, (_, i) => objective([i / 10000])),
    );
    assert.ok(Math.min(...values) < initialBest * 0.1);
    assert.ok(Math.min(...values) - referenceMinimum < 0.001);
  });
});
