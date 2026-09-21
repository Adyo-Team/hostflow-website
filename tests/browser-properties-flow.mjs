// Run with the supported control-browser runtime and an authenticated Tab.
// No credentials, cookie injection, fixtures, or backend shortcuts.
import assert from "node:assert/strict";

// Creates a clearly labelled QA record through the published UI. The caller
// archives the returned record after inspection; it never deletes user data.
export async function verifyPropertyCreation(tab, name) {
  assert.ok(name.startsWith("QA v0.3.1 — "));
  await tab.playwright.getByRole("link", { name: "Ajouter un logement", exact: true }).click();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).fill(name);
  await tab.playwright.getByRole("button", { name: "Continuer", exact: true }).click();
  await tab.playwright.getByRole("textbox", { name: "Adresse", exact: true }).fill("3 rue de contrôle QA");
  await tab.playwright.getByRole("textbox", { name: "Ville", exact: true }).fill("Bruxelles QA");
  await tab.playwright.getByRole("button", { name: "Continuer", exact: true }).click();
  await tab.playwright.getByRole("heading", { name: "Exploitation", exact: true }).waitFor({ state: "visible" });
  await tab.playwright.getByRole("button", { name: "Continuer", exact: true }).click();
  await tab.playwright.getByRole("heading", { name: "Accès et instructions", exact: true }).waitFor({ state: "visible" });
  await tab.playwright.getByRole("button", { name: "Continuer", exact: true }).click();
  await tab.playwright.getByRole("checkbox", { name: "Cuisine", exact: true }).check();
  await tab.playwright.getByRole("button", { name: "Enregistrer et ajouter les photos", exact: true }).click();
  await tab.playwright.getByRole("heading", { name: "Photos", exact: true }).waitFor({ state: "visible" });
  await tab.playwright.getByRole("link", { name: "Terminer et voir la fiche", exact: true }).click();
  await tab.playwright.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  const detailUrl = await tab.url();
  assert.match(new URL(detailUrl).pathname, /^\/properties\/[0-9a-f-]{36}$/);
  await tab.reload();
  await tab.playwright.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  assert.equal(await tab.playwright.getByText("Cuisine", { exact: true }).count(), 1);
  await tab.playwright.getByRole("link", { name: "Tous les logements", exact: true }).click();
  await tab.playwright.getByRole("link", { name: new RegExp(name) }).waitFor({ state: "visible" });
  return detailUrl;
}

export async function verifyPropertyNavigation(tab) {
  const origin = new URL(await tab.url()).origin;
  for (const [destination, path, heading] of [
    ["Vue d’ensemble", "/", "Vue d’ensemble"],
    ["Logements", "/properties", "Logements"],
    ["Équipe", "/team", "Votre équipe"],
    ["Logements", "/properties", "Logements"],
  ]) {
    await tab.playwright.getByRole("link", { name: destination, exact: true }).click();
    await tab.playwright.waitForURL(new URL(path, origin).href);
    await tab.playwright.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible" });
    await tab.playwright.getByRole("link", { name: "Logements", exact: true }).waitFor({ state: "visible" });
    assert.equal(await tab.playwright.getByRole("button", { name: "Logements", exact: true }).count(), 0);
    assert.equal(await tab.playwright.getByRole("button", { name: /Aucun espace créé/ }).count(), 0);
  }
  await tab.playwright.getByRole("link", { name: "Ajouter un logement", exact: true }).click();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).waitFor({ state: "visible" });
  assert.equal(new URL(await tab.url()).pathname, "/properties/new");
  await tab.reload();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).waitFor({ state: "visible" });
  return "Sidebar, organisation, ajout et actualisation du formulaire : réussis";
}

export async function verifySavedProperty(tab, name) {
  await tab.playwright.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  const detailUrl = await tab.url();
  await tab.reload();
  await tab.playwright.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  await tab.playwright.getByRole("link", { name: "Modifier", exact: true }).click();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).waitFor({ state: "visible" });
  assert.equal(await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).getAttribute("value"), name);
  await tab.reload();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).waitFor({ state: "visible" });
  await tab.back();
  await tab.playwright.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  assert.equal(await tab.url(), detailUrl);
  await tab.forward();
  await tab.playwright.getByRole("textbox", { name: "Nom du logement", exact: true }).waitFor({ state: "visible" });
  return "Fiche, édition préremplie, actualisation et Back/Forward : réussis";
}
