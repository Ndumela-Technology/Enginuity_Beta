// Shared engineering field + education options (kid-oriented beta)
(function () {
  "use strict";

  var FIELDS = [
    { value: "", label: "Select a field (optional)" },
    { value: "Mechanical Engineering", label: "Mechanical Engineering ⚙️" },
    { value: "Electrical Engineering", label: "Electrical Engineering ⚡" },
    { value: "Civil Engineering", label: "Civil Engineering 🏗️" },
    { value: "Aerospace Engineering", label: "Aerospace Engineering ✈️" },
  ];

  var EDUCATION_OPTIONS = [
    { value: "middle", label: "Middle-Schooler (10–14)" },
    { value: "high", label: "High-Schooler (15–18)" },
    { value: "student", label: "Student (18–25)" },
  ];

  function normalizeField(value) {
    return String(value || "").replace(/\s*[⚙️⚡🏗️✈️💻]\s*$/u, "").trim();
  }

  function fieldFocusLine(field) {
    var clean = normalizeField(field);
    if (!clean) return "";
    return (
      "Engineering field (STRICT — every project must clearly belong here): " +
      clean +
      ". Do NOT use builds from other disciplines."
    );
  }

  function populateEngineeringFieldSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    var selected = normalizeField(selectedValue || selectEl.value);
    selectEl.innerHTML = FIELDS.map(function (f) {
      var sel = f.value === selected ? " selected" : "";
      return (
        '<option value="' +
        f.value.replace(/"/g, "&quot;") +
        '"' +
        sel +
        ">" +
        f.label +
        "</option>"
      );
    }).join("");
  }

  function populateEducationSelect(selectEl, selectedValue) {
    if (!selectEl) return;
    var selected = selectedValue || selectEl.value || "high";
    selectEl.innerHTML = EDUCATION_OPTIONS.map(function (o) {
      var sel = o.value === selected ? " selected" : "";
      return (
        '<option value="' +
        o.value +
        '"' +
        sel +
        ">" +
        o.label +
        "</option>"
      );
    }).join("");
  }

  function ageForEducation(education) {
    if (education === "middle") return "10-14";
    if (education === "high") return "15-18";
    if (education === "student") return "18-25";
    return "15-18";
  }

  function bindFieldChangeGuard(selectEl, options) {
    if (!selectEl) return;
    options = options || {};
    selectEl.addEventListener("change", function () {
      var nextField = normalizeField(selectEl.value);
      var activeField = normalizeField(options.getActiveField && options.getActiveField());
      if (!activeField || !nextField || activeField === nextField) return;
      if (typeof options.onMismatch === "function") {
        options.onMismatch(activeField, nextField);
      }
    });
  }

  window.ENGINUITY_ENGINEERING_FIELDS = FIELDS;
  window.ENGINUITY_EDUCATION_OPTIONS = EDUCATION_OPTIONS;
  window.normalizeEngineeringField = normalizeField;
  window.engineeringFieldFocusLine = fieldFocusLine;
  window.populateEngineeringFieldSelect = populateEngineeringFieldSelect;
  window.populateEducationSelect = populateEducationSelect;
  window.ageForEducation = ageForEducation;
  window.bindEngineeringFieldGuard = bindFieldChangeGuard;
})();
