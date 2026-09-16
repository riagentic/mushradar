import { assertEquals } from "@std/assert";
import { testCell } from "aio/testing";
import { view } from "../src/cell/view.ts";
import { MAX_DAY_OFFSET } from "../src/model/time.ts";
import { SPECIES } from "../src/data/species.ts";
import { messages, speciesInfo, speciesName } from "../src/i18n.ts";

testCell(view, "day stays in today→future window", async (t) => {
  t.send.setDay(0);
  t.send.prevDay();
  t.expect.state((s) => s.day === 0);
  t.send.setDay(MAX_DAY_OFFSET);
  t.send.nextDay();
  t.expect.state((s) => s.day === MAX_DAY_OFFSET);
  t.send.setDay(2.6);
  t.expect.state((s) => s.day === 3);
  t.send.setDay(-5);
  t.expect.state((s) => s.day === 0);
  await t.expect.rejects(() => t.send.setDay(Number.NaN), /day/);
  t.expect.state((s) => s.day === 0);
});

testCell(
  view,
  "species filter toggles, picks replace each other",
  async (t) => {
    t.send.selectSpecies("hrib-smrkovy");
    t.expect.state((s) => s.species === "hrib-smrkovy");
    t.send.selectSpecies("hrib-smrkovy");
    t.expect.state((s) => s.species === "");
    t.send.pickCell(42, "hrib-smrkovy");
    t.expect.state((s) =>
      s.pick?.kind === "cell" && s.pick.index === 42 &&
      s.pick.species === "hrib-smrkovy"
    );
    t.send.pickTown("brno");
    t.expect.state((s) => s.pick?.kind === "town" && s.pick.id === "brno");
    t.send.clearPick();
    t.expect.state((s) => s.pick === null);
    await t.expect.rejects(() => t.send.pickCell(-1, "hrib-smrkovy"), /index/);
  },
);

testCell(view, "every layer toggles independently", (t) => {
  t.send.toggleMushrooms();
  t.send.toggleTowns();
  t.send.toggleForest();
  t.send.toggleRivers();
  t.send.toggleLakes();
  t.expect.state((s) =>
    !s.showMushrooms && !s.showTowns && !s.showForest && !s.showRivers &&
    !s.showLakes
  );
  t.send.toggleLakes();
  t.expect.state((s) => s.showLakes && !s.showRivers);
});

testCell(
  view,
  "language switch flips every catalog, cz is the default",
  (t) => {
    t.expect.state((s) => s.lang === "cz");
    t.send.setLang("en");
    t.expect.state((s) => s.lang === "en");
    t.send.setLang("cz");
    t.expect.state((s) => s.lang === "cz");
    // Anything other than the two known codes stays Czech, not a broken state.
    t.send.setLang("de" as never);
    t.expect.state((s) => s.lang === "cz");
    assertEquals(messages("en").pickMushroom, "Pick a mushroom");
    assertEquals(messages("cz").pickMushroom, "Vyberte houbu");
    for (const sp of SPECIES) {
      assertEquals(speciesName(sp, "cz"), sp.cz);
      assertEquals(speciesName(sp, "en"), sp.en);
      assertEquals(speciesInfo(sp, "cz"), sp.infoCz);
      assertEquals(speciesInfo(sp, "en"), sp.info);
      // No UI string may be left untranslated (Czech text must differ).
      assertEquals(sp.infoCz.length > 0 && sp.infoCz !== sp.info, true);
    }
  },
);

Deno.test("counts carry the number and the right plural in both languages", () => {
  const cz = messages("cz"), en = messages("en");
  assertEquals(
    [cz.stations(1), cz.stations(3), cz.stations(115), cz.stations(0)],
    ["1 stanice", "3 stanice", "115 stanic", "0 stanic"],
  );
  assertEquals(
    [cz.frames(1), cz.frames(2), cz.frames(13)],
    ["1 snímek", "2 snímky", "13 snímků"],
  );
  assertEquals([en.stations(1), en.frames(13)], ["1 station", "13 frames"]);
});
