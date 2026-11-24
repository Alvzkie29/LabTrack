import { Toaster as Sonner } from "sonner";
import type { ComponentProps } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import "./snackbar.css";

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="lab-snackbar-host"
      position="bottom-right"
      offset={24}
      mobileOffset={16}
      duration={5000}
      visibleToasts={3}
      gap={12}
      closeButton
      pauseWhenPageIsHidden
      containerAriaLabel="Notifications"
      icons={{ success: <CheckCircle2 size={20} />, error: <CircleAlert size={20} />, warning: <TriangleAlert size={20} />, info: <Info size={20} />, close: <X size={16} /> }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: "lab-snackbar",
          title: "lab-snackbar-title",
          description: "lab-snackbar-description",
          actionButton: "lab-snackbar-action",
          cancelButton: "lab-snackbar-cancel",
          closeButton: "lab-snackbar-close",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
