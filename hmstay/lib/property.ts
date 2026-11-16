/** Tiện nghi chọn sẵn cho hồ sơ cơ sở (lưu mã trong properties.amenities). */
export const AMENITIES: { key: string; label: string; group: string }[] = [
  { key: "wifi", label: "Wifi", group: "Cơ bản" },
  { key: "ac", label: "Điều hoà", group: "Cơ bản" },
  { key: "hot_water", label: "Nước nóng", group: "Cơ bản" },
  { key: "tv", label: "TV", group: "Cơ bản" },
  { key: "fridge", label: "Tủ lạnh", group: "Cơ bản" },
  { key: "washer", label: "Máy giặt", group: "Cơ bản" },
  { key: "kitchen", label: "Bếp / đồ nấu ăn", group: "Bếp & ăn uống" },
  { key: "breakfast", label: "Bữa sáng", group: "Bếp & ăn uống" },
  { key: "bbq", label: "BBQ / lửa trại", group: "Bếp & ăn uống" },
  { key: "parking", label: "Chỗ đậu xe", group: "Tiện ích" },
  { key: "pool", label: "Hồ bơi", group: "Tiện ích" },
  { key: "garden", label: "Sân vườn", group: "Tiện ích" },
  { key: "balcony", label: "Ban công / view đẹp", group: "Tiện ích" },
  { key: "karaoke", label: "Karaoke", group: "Tiện ích" },
  { key: "pets", label: "Cho phép thú cưng", group: "Quy định" },
  { key: "elevator", label: "Thang máy", group: "Tiện ích" },
  { key: "shuttle", label: "Đưa đón sân bay / bến xe", group: "Dịch vụ" },
  { key: "bike", label: "Cho thuê xe máy", group: "Dịch vụ" },
];
export const AMENITY_LABEL: Record<string, string> = Object.fromEntries(AMENITIES.map((a) => [a.key, a.label]));
export const TYPE_LABEL: Record<string, string> = { homestay: "Homestay", hotel: "Khách sạn nhỏ" };
export const MODE_LABEL: Record<string, string> = { room: "Bán theo phòng", whole: "Bán nguyên căn" };
