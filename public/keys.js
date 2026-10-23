// Number keys 1–4 pick an answer.
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea")) return;
  const index = Number(event.key) - 1;
  document.querySelectorAll(".option")[index]?.click();
});
