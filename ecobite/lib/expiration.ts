export function addExpirationInfo(item: any) {
  const today = new Date();

  const expirationDate = new Date(today);

  expirationDate.setDate(
    expirationDate.getDate() + item.estShelfDays
  );

  let status: "use_today" | "use_soon" | "good";

  if (item.estShelfDays <= 1) {
    status = "use_today";
  } else if (item.estShelfDays <= 3) {
    status = "use_soon";
  } else {
    status = "good";
  }

  return {
    ...item,

    daysLeft: item.estShelfDays,

    estimatedExpiration:
      expirationDate.toISOString().split("T")[0],

    status,
  };
}