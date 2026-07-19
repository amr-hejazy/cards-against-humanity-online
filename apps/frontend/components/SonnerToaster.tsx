import { Toaster as SonnerToaster } from "sonner";

export default function Toaster() {
  return (
    <SonnerToaster
      position='bottom-right'
      gap={12}
      icons={{ error: null }}
      toastOptions={{
        classNames: {
          toast:
            "!bg-primary !text-primary-foreground !border-2 !border-border !rounded-none !shadow-none !p-4 !gap-1 !select-text",
          title:
            "!text-label-caps !text-primary-foreground !font-sans !m-0 !leading-none !select-text",
          description:
            "!text-primary-foreground !font-sans !m-0 !leading-tight !opacity-90 !select-text",
        },
      }}
    />
  );
}
