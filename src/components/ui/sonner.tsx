import { Toaster as Sonner } from "sonner";

import { useIsNative } from "@/lib/use-is-native";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const native = useIsNative();
  return (
    <Sonner
      className="toaster group"
      mobileOffset={native ? { bottom: "var(--app-bottom-nav-h)" } : undefined}
      visibleToasts={2}
      duration={native ? 5000 : 4000}
      toastOptions={{
        classNames: {
          toast: [
            "group toast",
            "group-[.toaster]:bg-background group-[.toaster]:text-foreground",
            "group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            native
              ? "group-[.toaster]:min-h-[56px] group-[.toaster]:rounded-2xl group-[.toaster]:px-4 group-[.toaster]:py-3.5"
              : "",
          ]
            .filter(Boolean)
            .join(" "),
          description: "group-[.toast]:text-muted-foreground",
          actionButton: native
            ? "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:min-h-[36px] group-[.toast]:px-4 group-[.toast]:rounded-xl group-[.toast]:text-sm"
            : "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          icon: native ? "group-[.toast]:w-5 group-[.toast]:h-5" : "",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
