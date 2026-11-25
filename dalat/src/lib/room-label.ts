/** "Nguyên căn" hoặc tên các phòng cách nhau dấu phẩy (đặt ngoài: ghi chú phòng nhập tay). */
export function roomLabel(b: { bookingType: string; rooms: { room: { name: string } }[]; manualRoomInfo?: string | null }): string {
  if (b.bookingType === "WHOLE_UNIT") return "Nguyên căn";
  return b.rooms.map((r) => r.room.name).join(", ") || b.manualRoomInfo?.trim() || "Nguyên căn";
}
