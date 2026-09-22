/**
 * Small, dependency-free Gaussian-process optimizer for bounded simulations.
 * Matérn 5/2 covariance, GP posterior and marginal likelihood: Rasmussen &
 * Williams (2006), Chapters 2, 4 and 5: https://gaussianprocess.org/gpml/
 * Expected improvement for minimization: Snoek, Larochelle & Adams (2012):
 * https://proceedings.neurips.cc/paper/2012/hash/05311655a15b75fab86956663e1819cd-Abstract.html
 *
 * Hyperparameters are fitted on a small grid; acquisition is maximized over a
 * finite candidate pool. These approximations do not certify a global optimum.
 */

export interface GaussianProcess {
  predict(point: number[]): { mean: number; sigma: number };
  lengthScale: number;
  /** Numerical diagonal regularization in standardized outcome units. */
  jitter: number;
}

export interface ExpectedImprovementProposal {
  point: number[];
  mean: number;
  sigma: number;
  expectedImprovement: number;
}

function validatePoint(point: number[], dimensions: number): void {
  if (
    !Array.isArray(point) ||
    point.length !== dimensions ||
    point.some((x) => !Number.isFinite(x) || x < 0 || x > 1)
  ) {
    throw new RangeError(`GP points must have ${dimensions} finite coordinates in [0, 1].`);
  }
}

function validateData(points: number[][], values: number[]): number {
  if (!points.length || points.length !== values.length || !points[0]?.length) {
    throw new RangeError("GP requires nonempty points and matching loss values.");
  }
  const dimensions = points[0].length;
  for (const point of points) validatePoint(point, dimensions);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("GP loss values must be finite.");
  }
  return dimensions;
}

function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

function matern52(a: number[], b: number[], lengthScale: number): number {
  const r = Math.sqrt(5 * squaredDistance(a, b)) / lengthScale;
  return (1 + r + (r * r) / 3) * Math.exp(-r);
}

function cholesky(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let value = matrix[i][j];
      for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (!(value > 0) || !Number.isFinite(value)) return null;
        lower[i][j] = Math.sqrt(value);
      } else {
        lower[i][j] = value / lower[j][j];
      }
    }
  }
  return lower;
}

function solveLower(lower: number[][], rhs: number[]): number[] {
  const result = Array<number>(rhs.length).fill(0);
  for (let i = 0; i < rhs.length; i++) {
    let value = rhs[i];
    for (let j = 0; j < i; j++) value -= lower[i][j] * result[j];
    result[i] = value / lower[i][i];
  }
  return result;
}

function solveUpper(lower: number[][], rhs: number[]): number[] {
  const result = Array<number>(rhs.length).fill(0);
  for (let i = rhs.length - 1; i >= 0; i--) {
    let value = rhs[i];
    for (let j = i + 1; j < rhs.length; j++) value -= lower[j][i] * result[j];
    result[i] = value / lower[i][i];
  }
  return result;
}

/** Fit a GP to normalized inputs; posterior mean and sigma use original loss units. */
export function fitGaussianProcess(points: number[][], values: number[]): GaussianProcess {
  const dimensions = validateData(points, values);
  // Scale before centering to avoid overflowing when summing large finite losses.
  const magnitude = Math.max(1, ...values.map(Math.abs));
  const scaled = values.map((value) => value / magnitude);
  const scaledMean = scaled.reduce((sum, value) => sum + value / values.length, 0);
  const scaledDeviation = Math.sqrt(
    scaled.reduce((sum, value) => sum + (value - scaledMean) ** 2 / values.length, 0),
  );
  const mean = scaledMean * magnitude;
  // A flat history supplies no empirical amplitude. A small finite prior keeps
  // exploration possible instead of pretending the whole domain is certain.
  const scale = scaledDeviation > 1e-14 ? scaledDeviation * magnitude : magnitude * 1e-3;
  const normalized = scaled.map((value) => (value - scaledMean) / (scale / magnitude));

  // Exact repeats are one location. The variance of its observed mean represents
  // disagreement between repeats; identical deterministic evaluations add no noise.
  const groups = new Map<string, { point: number[]; outcomes: number[] }>();
  points.forEach((point, i) => {
    const key = point.join(",");
    const group = groups.get(key);
    if (group) group.outcomes.push(normalized[i]);
    else groups.set(key, { point: [...point], outcomes: [normalized[i]] });
  });
  const locations: number[][] = [];
  const outcomes: number[] = [];
  const noise: number[] = [];
  for (const group of groups.values()) {
    const count = group.outcomes.length;
    const average = group.outcomes.reduce((sum, value) => sum + value / count, 0);
    locations.push(group.point);
    outcomes.push(average);
    noise.push(
      count > 1
        ? group.outcomes.reduce((sum, value) => sum + (value - average) ** 2, 0) /
            (count * (count - 1))
        : 0,
    );
  }

  let fitted:
    | { lower: number[][]; alpha: number[]; score: number; lengthScale: number; jitter: number }
    | undefined;
  for (const baseLengthScale of [0.06, 0.12, 0.24, 0.45, 0.8, 1.4]) {
    const lengthScale = baseLengthScale * Math.sqrt(dimensions);
    const kernel = locations.map((a) => locations.map((b) => matern52(a, b, lengthScale)));
    for (const jitter of [1e-10, 1e-8, 1e-6, 1e-4, 1e-2]) {
      const matrix = kernel.map((row, i) =>
        row.map((value, j) => value + (i === j ? noise[i] + jitter : 0)),
      );
      const lower = cholesky(matrix);
      if (!lower) continue;
      const alpha = solveUpper(lower, solveLower(lower, outcomes));
      // Negative log marginal likelihood, omitting the constant n/2 log(2π).
      const score = outcomes.reduce(
        (sum, y, i) => sum + 0.5 * y * alpha[i] + Math.log(lower[i][i]),
        0,
      );
      if (Number.isFinite(score) && (!fitted || score < fitted.score)) {
        fitted = { lower, alpha, score, lengthScale, jitter };
      }
      break;
    }
  }
  if (!fitted) throw new Error("GP covariance could not be factorized.");
  const { lower, alpha, lengthScale, jitter } = fitted;
  return {
    lengthScale,
    jitter,
    predict(point) {
      validatePoint(point, dimensions);
      const covariance = locations.map((location) => matern52(location, point, lengthScale));
      const projected = solveLower(lower, covariance);
      const posteriorMean =
        mean + scale * covariance.reduce((sum, value, i) => sum + value * alpha[i], 0);
      const variance = Math.max(0, 1 - projected.reduce((sum, value) => sum + value * value, 0));
      return { mean: posteriorMean, sigma: scale * Math.sqrt(variance) };
    },
  };
}

function expectedImprovement(best: number, mean: number, sigma: number): number {
  const improvement = best - mean;
  if (sigma <= 0) return Math.max(0, improvement);
  const z = improvement / sigma;
  if (z < -9) return 0;
  if (z > 9) return Math.max(0, improvement);
  const density = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  // Standard normal CDF approximation (absolute error < 7.5e-8).
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const tail =
    density *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = z >= 0 ? 1 - tail : tail;
  return Math.max(0, improvement * cdf + sigma * density);
}

function radicalInverse(index: number, base: number): number {
  let value = 0;
  let weight = 1 / base;
  while (index > 0) {
    value += (index % base) * weight;
    index = Math.floor(index / base);
    weight /= base;
  }
  return value;
}

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  }
  return primes;
}

/** Propose an unevaluated point by maximizing minimization EI over a finite pool. */
export function proposeExpectedImprovement(
  points: number[][],
  values: number[],
  rng: () => number,
): ExpectedImprovementProposal {
  const model = fitGaussianProcess(points, values);
  const dimensions = points[0].length;
  const best = Math.min(...values);
  const incumbent = points[values.indexOf(best)];
  let proposal: ExpectedImprovementProposal | undefined;
  const consider = (point: number[]) => {
    if (points.some((existing) => squaredDistance(existing, point) < 1e-16)) return;
    const prediction = model.predict(point);
    const ei = expectedImprovement(best, prediction.mean, prediction.sigma);
    if (
      !proposal ||
      ei > proposal.expectedImprovement ||
      (ei === proposal.expectedImprovement && prediction.sigma > proposal.sigma)
    ) {
      proposal = { point, ...prediction, expectedImprovement: ei };
    }
  };
  const random = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("GP random generator must return finite values in [0, 1).");
    }
    return value;
  };

  consider(Array<number>(dimensions).fill(0.5));
  for (let i = 0; i < 320; i++) consider(Array.from({ length: dimensions }, random));
  for (const radius of [0.015, 0.05, 0.15, 0.35]) {
    for (let i = 0; i < 48; i++) {
      consider(incumbent.map((x) => Math.max(0, Math.min(1, x + radius * (2 * random() - 1)))));
    }
    for (let axis = 0; axis < dimensions; axis++) {
      for (const direction of [-1, 1]) {
        const point = [...incumbent];
        point[axis] = Math.max(0, Math.min(1, point[axis] + direction * radius));
        consider(point);
      }
    }
  }
  // Quasi-random coverage also makes progress when a supplied RNG is constant.
  const primes = firstPrimes(dimensions);
  for (let i = 1; i <= 128; i++)
    consider(primes.map((prime) => radicalInverse(i + points.length, prime)));
  if (!proposal) {
    for (let i = 1; i <= points.length + 1 && !proposal; i++) {
      consider(primes.map((prime) => radicalInverse(i, prime)));
    }
  }
  if (!proposal) throw new Error("GP acquisition could not find an unevaluated candidate.");
  return proposal;
}
