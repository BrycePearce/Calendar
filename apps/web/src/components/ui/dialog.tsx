// Adapted from shadcn/ui's MIT-licensed Radix Dialog composition.
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay" />
      <Primitive.Content
        className="dialog-content"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        {children}
        <Primitive.Close className="dialog-close" aria-label="Close details">
          <X size={20} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
