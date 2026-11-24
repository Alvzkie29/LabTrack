import { toast, type ExternalToast } from "sonner";

// Event-driven feedback shares one host, including messages on the sign-in page.
export const snackbar = {
  success: (message: string, options?: ExternalToast) => toast.success(message, { duration: 5000, ...options }),
  error: (message: string, options?: ExternalToast) => toast.error(message, { duration: 8000, ...options }),
  warning: (message: string, options?: ExternalToast) => toast.warning(message, { duration: 7000, ...options }),
  info: (message: string, options?: ExternalToast) => toast.info(message, { duration: 5000, ...options }),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
