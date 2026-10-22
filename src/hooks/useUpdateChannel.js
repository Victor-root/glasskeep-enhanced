import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api.js";

// The update channel (stable or beta) as the server sees it: the running
// build, the database's format level, the latest stable release and
// whether it reads this database, the backup taken before the beta.
// `change` switches channels; its answer says whether an update started.
export function useUpdateChannel({ token, isAdmin }) {
  const [info, setInfo] = useState(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api("/admin/update-channel", { token, timeoutMs: 10000 }));
    } catch {
      /* the channel control stays hidden */
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after the request resolves
    if (token && isAdmin) load();
  }, [token, isAdmin, load]);

  const change = useCallback(
    async ({ channel, action }) => {
      const result = await api("/admin/update-channel", {
        method: "POST",
        body: { channel, action },
        token,
        timeoutMs: 120000,
      });
      await load();
      return result;
    },
    [token, load]
  );

  return { info, load, change };
}
