import { QueryClient } from "@tanstack/react-query";

// Central react-query client. Put real API calls (fetch/axios wrappers,
// query hooks, etc.) in this `api/` folder as the backend comes online -
// right now every page reads from src/utils/mock-data(.ts|-extended.ts).
export const queryClient = new QueryClient();
