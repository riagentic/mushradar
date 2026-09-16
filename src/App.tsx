// Mushradar — HUD + 3D map.
import type { JSX } from "aio";
import { SPECIES } from "./data/species.ts";
import { TOWNS } from "./data/towns.ts";
import { geo, radar, view, weather } from "./cell.ts";
import { MANUAL_MIN_AGE_MS } from "./cell/weather.ts";
import { MAX_DAY_OFFSET, prettyDate, todayIso } from "./model/time.ts";
import { WMO_ICON, wmoKey } from "./model/weather.ts";
import { dateLocale, messages, speciesInfo, speciesName } from "./i18n.ts";
import { dayIso, hotspotAt, seriesIndexForDay } from "./ui/scores.ts";
import Map3D from "./ui/Map3D.tsx";
import MushroomPicture from "./ui/MushroomPicture.tsx";

export default function App(): JSX.Element {
  const lang = view.lang;
  const m = messages(lang);
  const locale = dateLocale(lang);
  const fmtDay = (d: string) => prettyDate(d, locale);
  const fmtStamp = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ms);
  // "Today" is the wall clock, not the day the data was fetched: persisted
  // state can be a day old, and then the stored date is yesterday.
  const today = todayIso();
  const iso = dayIso(today, view.day);
  const homeSt = weather.homeStation();
  const cur = homeSt?.current ?? weather.stations[0]?.current ?? null;
  const pick = view.pick;
  // Re-scored on every render, so the panel follows the day picker.
  const picked = pick?.kind === "cell"
    ? hotspotAt(weather.stations, view.day, pick.index, pick.species, today)
    : null;
  const townPick = pick?.kind === "town"
    ? TOWNS.find((t) => t.id === pick.id)
    : null;
  const townStation = townPick
    ? weather.stations.find((s) => s.id === townPick.id)
    : null;

  return (
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">🍄</span>
          <div>
            <h1>Mushradar</h1>
            <p class="muted tiny">{m.subtitle}</p>
          </div>
        </div>

        <div class="day-nav" role="group" aria-label={m.forecastDay}>
          <button
            type="button"
            t="prev-day"
            class="ghost"
            disabled={view.day <= 0}
            aria-label={m.prevDay}
            onClick={() => view.prevDay()}
          >
            ←
          </button>
          <div class="day-label">
            <strong>{view.day === 0 ? m.today : `+${view.day}d`}</strong>
            <span class="muted">{fmtDay(iso)}</span>
          </div>
          <button
            type="button"
            t="next-day"
            class="ghost"
            disabled={view.day >= MAX_DAY_OFFSET}
            aria-label={m.nextDay}
            onClick={() => view.nextDay()}
          >
            →
          </button>
        </div>

        <div class="lang-switch" role="group" aria-label={m.language}>
          <button
            type="button"
            t="lang-cz"
            class={lang === "cz" ? "chip on" : "chip"}
            onClick={() => view.setLang("cz")}
          >
            CZ
          </button>
          <button
            type="button"
            t="lang-en"
            class={lang === "en" ? "chip on" : "chip"}
            onClick={() => view.setLang("en")}
          >
            EN
          </button>
        </div>

        <div class="status-pills">
          <span class="pill" title={m.yourLocation}>
            📍 {geo.label || "…"}
            {geo.busy ? " …" : ""}
          </span>
          <span class="pill" title={m.stationsTitle}>
            🌤 {weather.busy ? m.loading : m.stations(weather.stations.length)}
          </span>
          <span class="pill" title={m.radarTitle}>
            📡 {radar.busy
              ? m.radarBusy
              : radar.past.length
              ? m.frames(radar.past.length)
              : m.noRadar}
          </span>
        </div>
      </header>

      <div class="main-stage">
        <aside class="side panel">
          <section>
            <h2>{m.speciesTitle}</h2>
            <button
              type="button"
              t="species-all"
              class={view.species === "" ? "chip on" : "chip"}
              onClick={() => view.selectSpecies("")}
            >
              {m.all}
            </button>
            <div class="chip-list">
              {SPECIES.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  t={`species-${s.id}`}
                  class={view.species === s.id ? "chip on" : "chip"}
                  onClick={() => view.selectSpecies(s.id)}
                  title={s.latin}
                >
                  <span
                    class="swatch"
                    style={{ background: s.look.capColor }}
                    aria-hidden="true"
                  />
                  {speciesName(s, lang)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>{m.layersTitle}</h2>
            <label class="toggle">
              <input
                type="checkbox"
                t="toggle-mushrooms"
                checked={view.showMushrooms}
                onChange={() => view.toggleMushrooms()}
              />
              {m.mushrooms}
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                t="toggle-towns"
                checked={view.showTowns}
                onChange={() => view.toggleTowns()}
              />
              {m.towns}
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                t="toggle-forest"
                checked={view.showForest}
                onChange={() => view.toggleForest()}
              />
              {m.forest}
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                t="toggle-rivers"
                checked={view.showRivers}
                onChange={() => view.toggleRivers()}
              />
              {m.rivers}
            </label>
            <label class="toggle">
              <input
                type="checkbox"
                t="toggle-lakes"
                checked={view.showLakes}
                onChange={() => view.toggleLakes()}
              />
              {m.lakes}
            </label>
            <button
              type="button"
              class="primary block"
              t="locate"
              disabled={geo.busy}
              onClick={() => geo.locate()}
            >
              {geo.busy ? m.locating : m.locateMe}
            </button>
            <button
              type="button"
              class="ghost block"
              t="refresh-wx"
              disabled={weather.busy}
              onClick={() => weather.refresh(MANUAL_MIN_AGE_MS)}
            >
              {m.refreshWeather}
            </button>
          </section>

          <section class="wx-card">
            <h2>{m.conditions}</h2>
            {cur
              ? (
                <div>
                  <div class="wx-now">
                    <span class="wx-icon">{WMO_ICON(cur.code, cur.isDay)}</span>
                    <div>
                      <strong>{Math.round(cur.temp)}°C</strong>
                      <div class="muted tiny">{m.wmo[wmoKey(cur.code)]}</div>
                    </div>
                  </div>
                  <p class="muted tiny">
                    {m.feels} {Math.round(cur.feels)}° · {m.rh}{" "}
                    {Math.round(cur.rh)}% · {m.wind} {Math.round(cur.wind)} km/h
                  </p>
                </div>
              )
              : <p class="muted">{m.waitingWeather}</p>}
            {weather.fetchedAt > 0 && (
              <p class="muted tiny" t="wx-updated">
                {m.updated} {fmtStamp(weather.fetchedAt)}
              </p>
            )}
            {weather.error && <p class="err">{weather.error}</p>}
            {geo.error && <p class="err">{geo.error}</p>}
            {radar.error && <p class="err">{radar.error}</p>}
          </section>

          <p class="hint muted tiny">{m.hint}</p>
        </aside>

        <div class="map-wrap">
          <Map3D />
        </div>

        <aside class="detail panel">
          {picked
            ? (
              <div>
                <h2>{speciesName(picked.species, lang)}</h2>
                <p class="muted tiny">
                  <em>{picked.species.latin}</em>
                </p>
                <MushroomPicture species={picked.species} lang={lang} />
                <p class="score-line">
                  <span class={`lvl ${picked.lvl}`}>{m.level[picked.lvl]}</span>
                  <strong>{Math.round(picked.score.score * 100)}%</strong>
                  <span class="muted tiny">
                    {m.conf} {Math.round(picked.score.confidence * 100)}%
                  </span>
                </p>
                <ul class="factors">
                  <li>
                    {m.factors.habitat}{" "}
                    {Math.round(picked.score.factors.habitat * 100)}%
                  </li>
                  <li>
                    {m.factors.season}{" "}
                    {Math.round(picked.score.factors.season * 100)}%
                  </li>
                  <li>
                    {m.factors.temp}{" "}
                    {Math.round(picked.score.factors.temp * 100)}%
                  </li>
                  <li>
                    {m.factors.moist}{" "}
                    {Math.round(picked.score.factors.moist * 100)}%
                  </li>
                  <li>
                    {m.factors.frost}{" "}
                    {Math.round(picked.score.factors.frost * 100)}%
                  </li>
                  <li>
                    {m.factors.wind}{" "}
                    {Math.round(picked.score.factors.wind * 100)}%
                  </li>
                </ul>
                <p>{speciesInfo(picked.species, lang)}</p>
                <p class="muted tiny">
                  {m.cell}
                  {picked.index} · {picked.alt} m · {picked.lat.toFixed(3)}N
                  {" "}
                  {picked.lon.toFixed(3)}E · {fmtDay(iso)}
                </p>
                <button
                  type="button"
                  class="ghost"
                  t="clear-pick"
                  onClick={() => view.clearPick()}
                >
                  {m.close}
                </button>
              </div>
            )
            : townPick
            ? (
              <div>
                <h2>{townPick.name}</h2>
                {(() => {
                  const d = townStation?.daily;
                  const i = seriesIndexForDay(d?.time ?? [], view.day, today);
                  if (d && i >= 0 && i < d.time.length) {
                    const code = d.code[i] ?? 0;
                    return (
                      <div>
                        <div class="wx-now">
                          <span class="wx-icon">{WMO_ICON(code, true)}</span>
                          <div>
                            <strong>
                              {Math.round(d.tmin[i])}–{Math.round(d.tmax[i])}°C
                            </strong>
                            <div class="muted tiny">
                              {m.wmo[wmoKey(code)]} · {fmtDay(d.time[i])}
                            </div>
                          </div>
                        </div>
                        <p class="muted tiny">
                          {m.rain} {Math.round(d.rain[i] ?? 0)} mm · {m.wind}
                          {" "}
                          {Math.round(d.wind[i] ?? 0)} km/h · {m.rh}{" "}
                          {Math.round(d.rh[i] ?? 0)}%
                        </p>
                      </div>
                    );
                  }
                  if (townStation?.current) {
                    return (
                      <p>
                        {WMO_ICON(townStation.current.code)}{" "}
                        {Math.round(townStation.current.temp)}°C ·{" "}
                        {m.wmo[wmoKey(townStation.current.code)]}
                      </p>
                    );
                  }
                  return <p class="muted">{m.noReading}</p>;
                })()}
              </div>
            )
            : (
              <div class="empty-detail">
                <h2>{m.pickMushroom}</h2>
                <p class="muted">{m.emptyBody(fmtDay(iso))}</p>
              </div>
            )}
        </aside>
      </div>
    </div>
  );
}
