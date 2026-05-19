export class PathTraversalError extends Error {
  constructor(segment: string) {
    super(`Path segment is not allowed: ${segment}`);
    this.name = 'PathTraversalError';
  }
}
