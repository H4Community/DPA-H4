(() => {
  const form = document.getElementById("workshopForm");
  const field = (id) => document.getElementById(id);
  const board = field("boardId");
  const boardSearch = field("boardSearch");
  const school = field("schoolId");
  const schoolSearch = field("schoolSearch");
  const schoolPicker = field("schoolPicker");
  const manualField = field("manualSchoolField");
  const manualName = field("schoolName");
  const workshopDetails = field("workshopDetails");
  const role = field("signupRole");
  const schoolDetails = field("signupSchoolDetails");
  const instagramField = field("teacherInstagram").closest(".form-field");
  const submit = field("workshopSubmitBtn");
  const error = field("formError");
  const confirmation = field("formReadyPanel");
  const workshop = "Full-Day School Workshop";
  const tutorial = "Free Online Dance Tutorial";
  const boardAliases = {
    B67059: ["TCDSB", "Toronto Catholic District School Board"],
    B66052: ["TDSB", "Toronto District School Board"]
  };

  let sending = false;
  let lastAttempt;
  const inquiryType = () => form.inquiryType.value;
  const normalize = (value) => value.toLowerCase().normalize("NFD")
    .replace(/\p{M}/gu, "").replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]/g, "");

  const matches = (query, labels) => labels.some((label) => normalize(label).includes(normalize(query)));

  function populate(select, placeholder, options) {
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ""), ...options.map(([id, label]) => new Option(label, id)));
    if (options.some(([id]) => id === selected)) select.value = selected;
  }

  function listBoards() {
    const selected = board.value;
    const options = Object.entries(H4_SCHOOL_DIRECTORY).flatMap(([id, [name]]) => {
      const aliases = boardAliases[id] || [];
      if (id !== selected && !matches(boardSearch.value, [name, ...aliases])) return [];
      return [[id, aliases.length ? aliases.join(" · ") : name]];
    });
    populate(board, options.length ? "Select a school board" : "No matching boards", [
      ...options, ["other", "Independent school / Other"]
    ]);
  }

  function listSchools() {
    const selected = school.value;
    const schools = H4_SCHOOL_DIRECTORY[board.value]?.[1] || {};
    const options = Object.entries(schools).flatMap(([id, [name, city]]) => {
      if (id !== selected && !matches(schoolSearch.value, [name, city])) return [];
      return [[id, city ? name + " · " + city : name]];
    });
    populate(school, options.length ? "Select your school" : "No matching schools",
      [...options, ["manual", "My school isn’t listed"]]);
  }

  function updateManual() {
    const enabled = !schoolDetails.hidden && (board.value === "other" || school.value === "manual");
    manualField.hidden = !enabled;
    manualName.disabled = !enabled;
    manualName.required = enabled;
    if (!enabled) manualName.value = "";
  }

  function changeBoard() {
    school.value = "";
    schoolSearch.value = "";
    manualName.value = "";
    schoolPicker.hidden = board.value === "other";
    school.disabled = schoolDetails.hidden || !board.value || schoolPicker.hidden;
    schoolSearch.disabled = school.disabled;
    schoolSearch.placeholder = board.value ? "Type part of your school name" : "Select a board first";
    listSchools();
    updateManual();
  }

  function updateInterest() {
    const isParent = role.value === "Parent / Caregiver";
    const isWorkshop = inquiryType() === workshop;
    schoolDetails.hidden = isParent && !isWorkshop;
    board.disabled = schoolDetails.hidden;
    boardSearch.disabled = schoolDetails.hidden;
    school.disabled = schoolDetails.hidden || !board.value || schoolPicker.hidden;
    schoolSearch.disabled = school.disabled;
    updateManual();
    instagramField.hidden = isParent;
    field("teacherInstagram").disabled = isParent;
    if (isParent) field("teacherInstagram").value = "";
    workshopDetails.hidden = !isWorkshop;
    for (const control of workshopDetails.querySelectorAll("input, select")) {
      control.disabled = workshopDetails.hidden;
      if (workshopDetails.hidden) {
        if (control.type === "checkbox") control.checked = false;
        else control.value = "";
      }
    }
    submit.textContent = inquiryType() === tutorial
      ? "Email Me the Free Resources →"
      : inquiryType() === workshop ? "Request Workshop Dates →" : "Send Request →";
  }

  function showError(message, input = error) {
    error.textContent = message;
    error.hidden = false;
    input.focus();
  }

  function selectInterest(interest) {
    if (sending) return;
    if (form.hidden) resetForm();
    form.inquiryType.value = interest;
    error.hidden = true;
    updateInterest();
  }

  function resetForm() {
    form.reset();
    lastAttempt = undefined;
    error.hidden = true;
    confirmation.hidden = true;
    form.hidden = false;
    listBoards();
    changeBoard();
    updateInterest();
  }

  boardSearch.addEventListener("input", listBoards);
  schoolSearch.addEventListener("input", listSchools);
  board.addEventListener("change", changeBoard);
  school.addEventListener("change", updateManual);
  role.addEventListener("change", updateInterest);
  form.addEventListener("input", (event) => {
    if (!sending) error.hidden = true;
    event.target.removeAttribute("aria-invalid");
  });
  form.querySelectorAll("[name=inquiryType]").forEach((radio) =>
    radio.addEventListener("change", updateInterest));
  field("formEditBtn").addEventListener("click", () => {
    resetForm();
    field("teacherName").focus();
  });
  listBoards();
  changeBoard();
  updateInterest();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    error.hidden = true;
    const required = [
      [role, "Select your role."],
      [field("teacherName"), "Enter your name."],
      [field("teacherEmail"), "Enter a valid email address."],
      [board, "Select your school board."],
      [school, "Select your school or choose ‘My school isn’t listed’."],
      [manualName, "Enter your school name."]
    ];
    for (const [control, message] of required) {
      if (!control.disabled && (!control.value.trim() || !control.validity.valid)) {
        control.setAttribute("aria-invalid", "true");
        showError(message, control);
        return;
      }
    }

    const endpoint = (window.H4_TEACHER_FORM_CONFIG?.endpoint || form.dataset.endpoint || "").trim();
    if (!endpoint) {
      showError("Online requests are temporarily unavailable. Please email info@h4community.org.");
      return;
    }

    const fields = new FormData(form);
    const payload = {
      interest: inquiryType(),
      role: role.value,
      fullName: fields.get("teacherName").trim(),
      email: fields.get("email").trim(),
      boardId: board.disabled ? "" : board.value,
      schoolId: school.disabled ? "" : school.value,
      schoolName: (fields.get("schoolName") || "").trim(),
      phone: fields.get("phone").trim(),
      instagram: (fields.get("instagram") || "").trim(),
      grades: fields.getAll("grades"),
      preferredTiming: fields.get("targetMonth") || "",
      website: fields.get("website") || ""
    };
    const snapshot = JSON.stringify(payload);
    if (lastAttempt?.snapshot !== snapshot) lastAttempt = { snapshot, key: crypto.randomUUID() };

    sending = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Sending request…";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, submissionKey: lastAttempt.key })
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true || data.saved !== true || !data.leadId) {
        showError("We couldn’t confirm your request. Your details are still here. Please try again.");
        return;
      }
      form.hidden = true;
      confirmation.hidden = false;
      field("formReadyTitle").textContent = "Request received";
      field("formReadyBody").textContent = data.emailStatus === "Sent"
        ? "Thanks! Check your inbox for an email from H4 Community."
        : "Thanks! Your request is saved. H4 Community will follow up by email.";
      confirmation.focus();
    } catch {
      showError("We couldn’t confirm your request. Your details are still here. Please try again.");
    } finally {
      sending = false;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      updateInterest();
    }
  });

  window.__h4TeacherForm = { selectInterest, getSelectedInquiryType: inquiryType };
})();
