export const metrics = {
  increment(name: string, tags: Record<string, string> = {}) {
    return { name, tags };
  },
};
