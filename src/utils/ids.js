// Client-generated ids: time-ordered, with a random suffix.
export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
