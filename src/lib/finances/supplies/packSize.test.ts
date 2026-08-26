import { describe, expect, it } from "vitest";
import { parsePackCount } from "./packSize";

describe("parsePackCount", () => {
  it("reads the spellings Amazon actually uses", () => {
    const cases: [string, number][] = [
      [
        "Amazon Basics Lawn & Leaf Drawstring Trash Bags, Unscented, 39 Gallon, 40 Count",
        40,
      ],
      ["Besli 8 Gallon Black Drawstring Trash Bag, 0.9 Mil, 90 Counts", 90],
      ["USB Rechargeable AA Batteries by Pale Blue, LED Charge Indicator, 4-Pack", 4],
      ["IRIS USA 10Pack Small Plastic Hobby Art Craft Supply Organizer", 10],
      ["Power Strip Tower, 14 Outlet Plugs with 4 USB Slot 6 feet Cord (1-PACK)", 1],
      ["Purina Fancy Feast Grilled Wet Cat Food Variety Pack, 24 ct Box", 24],
      ["Komax Reusable Gel Ice Packs for Lunch Bags, Set of 6, Slim Design", 6],
      [
        "Concord Foods Mild Salsa Mix, 1.06-Ounce Pouches (VALUE Pack of 18 Pounces)",
        18,
      ],
      [
        "Scotch Super Thin Waterproof Vinyl Tape, .75-Inch by 125-Inch, 5-Pack - 190T",
        5,
      ],
      [
        "Zip Ties 4 inch, Small Zip Ties with 18 lb Tensile Strength, Black, 200 Pack",
        200,
      ],
    ];
    for (const [title, expected] of cases) {
      expect(parsePackCount(title), title).toBe(expected);
    }
  });

  it("multiplies a pack-of-packs", () => {
    // 8 sleeves of 42 wipes is 336 wipes, not 8 of anything you consume.
    expect(parsePackCount("Adult Toilet Wipes, Fragrance Free (8 Packs of 42)")).toBe(
      336,
    );
  });

  it("takes the leading figure when a title states the size twice", () => {
    expect(
      parsePackCount(
        "Amazon Basics Flushable Adult Toilet Wipes, Fragrance Free, 336 Count (8 Packs of 42)",
      ),
    ).toBe(336);
  });

  it("never reads a volume, weight or length as a pack size", () => {
    const notPacks = [
      "Neutrogena Ultra Sheer Sunscreen Lotion with Broad Spectrum SPF 70, 3 Fl Oz",
      "Old Spice Red Zone Swagger Scent Body Wash for Men, 30 Ounce",
      "Nulo Grain-Free Real Shreds Wet Canned Cat Food, Variety Pack, 2.8 Ounce",
      "COSIMIXO Heavy Duty Duct Tape, 2 inches x 30 Yards",
      "Optimum Nutrition Micronized Creatine Monohydrate Powder, 400 Servings",
      "ACCUSPLIT AL608 Finger Hold Tally Counter",
    ];
    for (const title of notPacks) {
      expect(parsePackCount(title), title).toBeNull();
    }
  });

  it("returns null rather than guessing one", () => {
    expect(parsePackCount("")).toBeNull();
    expect(parsePackCount("Listerine Cool Mint Antiseptic Mouthwash, 1 L")).toBeNull();
  });
});
