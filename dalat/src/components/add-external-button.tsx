"use client";

import { Modal } from "@/components/modal";
import { ExternalPropertyForm, type ExternalDefaults } from "@/components/external-property-form";
import { createExternalPropertyAction, updateExternalPropertyAction } from "@/app/(app)/broker/properties/actions";

export function AddExternalButton() {
  return (
    <Modal trigger="+ Thêm Homestay ngoài" title="Thêm Homestay ngoài hệ thống">
      {(close) => <ExternalPropertyForm action={createExternalPropertyAction} onDone={close} />}
    </Modal>
  );
}

export function EditExternalButton({ id, defaults }: { id: string; defaults: ExternalDefaults }) {
  return (
    <Modal trigger="✏️ Sửa thông tin" title="Sửa homestay ngoài hệ thống">
      {(close) => <ExternalPropertyForm action={updateExternalPropertyAction.bind(null, id)} defaults={defaults} submitLabel="Lưu thay đổi" onDone={close} />}
    </Modal>
  );
}
