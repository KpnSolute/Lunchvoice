// Real 28-day cycle menu from the MJCC Miami Job Corps menu.
// Static content, not user data — lives in the frontend, no DB table.
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// [lunchEntree, lunchAlt, dinnerEntree, dinnerAlt] for Day 1 - Day 28
export const CYCLE: [string, string, string, string][] = [
  ["Char Sui Pork", "Chef's Choice", "Tuna Casserole", "Baked Stuffed Pasta Shell"],
  ["Chef's Choice", "Jamaican Patty", "Jerk Chicken", "Fried Pork Chops"],
  ["Sweet & Sour Meatball", "Italian Turkey Club", "Baked Ziti", "Grilled Shrimp"],
  ["Fried Chicken", "Chef's Choice", "Chicken Marsala", "Beef Stew"],
  ["Pork Teriyaki", "Grilled Hot Dog", "Crusted Cod", "Hasselback Chicken"],
  ["Buffalo Wings", "Assorted Pizza", "Tuscan Chicken", "Country Fried Steak"],
  ["Sweet & Sour Pork", "Chef Special", "Fried Chicken", "Pepper Steak"],
  ["Sausage & Beans", "Chef Special", "Shepherd's Pie", "Chicken Parmesan"],
  ["Jerk Pork", "Sloppy Joe", "Creole Shrimp", "BBQ Steak"],
  ["BBQ Chicken", "Tuna Sandwich", "Italian Meatballs", "Sausage & Peppers"],
  ["Rustic Beef Stew", "Grilled Cheese Sandwich", "Fried Shrimp", "Asian Chicken Roast"],
  ["Rotisserie Chicken", "Corn Dog", "BBQ Pulled Pork", "Creole Mahi Mahi"],
  ["Cheese Burger", "Chef's Choice", "Fried Catfish", "Cheese Ravioli"],
  ["Grilled Steak", "Chef Special", "Baked Chicken", "Jäger Schnitzel"],
  ["Escovitch Fish", "Chef Special", "Chicken Cacciatore", "Pork Chop with Mushroom Gravy"],
  ["Curry Chicken", "BBQ Pork Sandwich", "Rustic Meatloaf", "Baked Stuffed Fish"],
  ["Burrito Bowl", "Meatball Sub", "Grilled Bratwurst w/ Pepper & Onion", "London Broil Steak"],
  ["Brown Stew Chicken", "Chili Dog", "Braised Beef Brisket", "Chicken Florentine"],
  ["Red Pepper Shrimp", "Philly Cheese Steak", "Chili Lime Pork Loin", "Roast Turkey"],
  ["Honey BBQ Wings", "Cheesy Beef Sandwich", "Baked Salmon", "Soy Dijon Pork Loin"],
  ["Tuna Melt", "Chef Special", "Beef Prime Rib", "Orange Chicken Nuggets"],
  ["Baked Ziti", "Chef Special", "Cajun Grilled Chicken", "Smothered Pork Chops"],
  ["Herbed Roasted Chicken", "Pork Quesadilla", "Teriyaki Mahi Mahi", "Bistro Steak"],
  ["Picadillo Pork", "Deli Sandwich", "Mambo Pork Roast", "BBQ Turkey Meatloaf"],
  ["Chicken Piperade", "Buffalo Chicken Sandwich", "Chicken Adobo", "Fish w/ Garlic Butter"],
  ["Chipotle Steak", "Fish Sandwich", "Veal Marsala", "Chicken with Pepper"],
  ["Korean Chicken Wings", "Fried Shrimp", "Baked Beefaroni", "Fried Fish"],
  ["Glazed Ham", "Glazed Ham", "Citrus Rotisserie Chicken", "Fajita Meat w/ Soft Tacos"],
];

export const STAPLES = [
  { id: "bacon", name: "Baked Bacon" },
  { id: "eggs", name: "Hard Boiled Eggs" },
  { id: "grits", name: "Grits / Oatmeal" },
  { id: "toast", name: "French Toast / Waffles" },
  { id: "salad", name: "Salad Bar (rotating salad)" },
  { id: "pasta", name: "Pasta Salad" },
  { id: "fruit", name: "Fruit Salad / Whole Fruits" },
  { id: "pudding", name: "Assorted Puddings / Jell-O" },
];

export type Slot = "lunchEntree" | "lunchAlt" | "dinnerEntree" | "dinnerAlt" | "staple";

export function weekdayFor(dayIndex: number): string {
  return WEEKDAYS[dayIndex % 7];
}

// The four rated dishes for a given cycle day (1-28).
export function slotsForDay(day: number): { slot: Slot; label: string; name: string }[] {
  const [lunchEntree, lunchAlt, dinnerEntree, dinnerAlt] = CYCLE[day - 1];
  return [
    { slot: "lunchEntree", label: "Lunch — Entrée", name: lunchEntree },
    { slot: "lunchAlt", label: "Lunch — Alt/Sandwich", name: lunchAlt },
    { slot: "dinnerEntree", label: "Dinner — Entrée", name: dinnerEntree },
    { slot: "dinnerAlt", label: "Dinner — Alt", name: dinnerAlt },
  ];
}
