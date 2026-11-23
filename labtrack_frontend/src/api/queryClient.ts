import { QueryClient } from "@tanstack/react-query";

// Shared cache for API reads across staff pages and mutation invalidation.
export const queryClient = new QueryClient();
