// import { foodData } from "./foodData";

// export function calculateExpiration(
//   foodName: string,
//   purchaseDate: Date = new Date()
// ) {
//   const normalizedName = foodName.toLowerCase();

//   const shelfLife = foodData[normalizedName] ?? 7;

//   const expirationDate = new Date(purchaseDate);

//   expirationDate.setDate(
//     expirationDate.getDate() + shelfLife
//   );

//   const today = new Date();

//   const millisecondsLeft =
//     expirationDate.getTime() - today.getTime();

//   const daysLeft = Math.ceil(
//     millisecondsLeft / (1000 * 60 * 60 * 24)
//   );

//   let status;

//   if (daysLeft <= 0) {
//     status = "expired";
//   } else if (daysLeft <= 1) {
//     status = "use_today";
//   } else if (daysLeft <= 3) {
//     status = "use_soon";
//   } else {
//     status = "good";
//   }

//   return {
//     foodName,
//     shelfLife,
//     expirationDate,
//     daysLeft,
//     status,
//   };
// }