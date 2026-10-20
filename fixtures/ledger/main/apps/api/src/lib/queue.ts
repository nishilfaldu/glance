export function enqueue(job: string, payload: unknown) {
  return { job, payload };
}
