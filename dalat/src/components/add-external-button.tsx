"use client";

import { Modal } from "@/components/modal";
import { ExternalPropertyForm } from "@/components/external-property-form";

export function AddExternalButton() {
  return (
    <Modal trigger="+ Thêm Homestay ngoài" title="Thêm Homestay ngoài hệ thống">
      {(close) => <ExternalPropertyForm onDone={close} />}
    </Modal>
  );
}
