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
    B28010: ["ADSB", "Algoma District School Board"],
    B67202: ["ALCDSB", "Algonquin and Lakeshore Catholic District School Board"],
    B66010: ["AMDSB", "Avon Maitland District School Board"],
    B80012: ["BSA", "Bloorview School Authority"],
    B66001: ["BWDSB", "Bluewater District School Board"],
    B67164: ["BHNCDSB", "Brant Haldimand Norfolk Catholic District School Board"],
    B67008: ["BGCDSB", "Bruce-Grey Catholic District School Board"],
    B67172: ["CDSBEO", "Catholic District School Board of Eastern Ontario"],
    B80055: ["CHEO", "CHEO School Authority"],
    B66303: ["CSV", "Conseil scolaire Viamonde", "Viamonde"],
    B67318: ["CSC MonAvenir", "Conseil scolaire catholique MonAvenir", "CSCM", "MonAvenir"],
    B28118: ["CSPGNO", "Conseil scolaire public du Grand Nord de l'Ontario"],
    B28100: ["CSPNE", "Conseil scolaire public du Nord-Est de l'Ontario"],
    B29114: ["CSCFN", "Conseil scolaire catholique Franco-Nord", "CSDCFN", "Franco-Nord"],
    B67326: ["CSDCEO", "Conseil scolaire de district catholique de l'Est ontarien"],
    B29130: ["CSDCAB", "Conseil scolaire de district catholique des Aurores boréales"],
    B29106: ["CSCDGR", "Conseil scolaire catholique de district des Grandes Rivières", "CSDCGR"],
    B67334: ["CECCE", "Conseil des écoles catholiques du Centre-Est", "CSDCCEO"],
    B29122: ["CSC Nouvelon", "Conseil scolaire catholique Nouvelon", "CSDCNO", "Nouvelon"],
    B67300: ["CSC Providence", "CSCP"],
    B80509: ["CCJL"],
    B66311: ["CEPEO", "Conseil des écoles publiques de l'Est de l'Ontario", "CÉPEO"],
    B66150: ["DSBN", "District School Board of Niagara"],
    B28002: ["DSB1", "District School Board Ontario North East", "DSBONE"],
    B67083: ["DPCDSB", "Dufferin-Peel Catholic District School Board"],
    B67105: ["DCDSB", "Durham Catholic District School Board"],
    B66060: ["DDSB", "Durham District School Board"],
    B66168: ["GEDSB", "Grand Erie District School Board"],
    B80020: ["GSA", "Grandview School Authority"],
    B66028: ["GECDSB", "Greater Essex County District School Board"],
    B67113: ["HCDSB", "Halton Catholic District School Board"],
    B66133: ["HDSB", "Halton District School Board"],
    B67121: ["HWCDSB", "Hamilton-Wentworth Catholic District School Board"],
    B66141: ["HWDSB", "Hamilton-Wentworth District School Board"],
    B66222: ["HPEDSB", "Hastings and Prince Edward District School Board"],
    B67016: ["HPCDSB", "Huron-Perth Catholic District School Board"],
    B29025: ["HSCDSB", "Huron-Superior Catholic District School Board"],
    B15148: ["JBLSSB", "James Bay Lowlands Secondary School Board"],
    B80047: ["JMCCSA", "John McGivney Children's Centre School Authority"],
    B66079: ["KPRDSB", "Kawartha Pine Ridge District School Board", "KPR"],
    B28045: ["KPDSB", "Keewatin-Patricia District School Board"],
    B29050: ["KCDSB", "Kenora Catholic District School Board"],
    B80039: ["KASA", "KidsAbility School Authority"],
    B28061: ["LDSB", "Lakehead District School Board"],
    B66036: ["LKDSB", "Lambton Kent District School Board"],
    B66206: ["LDSB", "Limestone District School Board"],
    B67032: ["LDCSB"],
    B15199: ["MFIDSAB", "Moose Factory Island District School Area Board"],
    B15202: ["MDSAB", "Moosonee District School Area Board"],
    B28037: ["NNDSB", "Near North District School Board"],
    B67156: ["NCDSB", "Niagara Catholic District School Board"],
    B80004: ["NPCCSA", "Niagara Peninsula Children's Centre School Authority"],
    B29017: ["NPSCDSB", "Nipissing-Parry Sound Catholic District School Board"],
    B29009: ["NCDSB", "Northeastern Catholic District School Board"],
    B29041: ["TNCDSB", "Northwest Catholic District School Board", "NWCDSB"],
    B67180: ["OCSB", "Ottawa Catholic School Board"],
    B66184: ["OCDSB", "Ottawa-Carleton District School Board"],
    B66125: ["PDSB", "Peel District School Board"],
    B79910: ["PPSSB", "Penetanguishene Protestant Separate School Board"],
    B67067: ["PVNCCDSB", "Peterborough Victoria Northumberland and Clarington Catholic District School Board"],
    B76686: ["PDSB-Prov", "Provincial and Demonstration Schools Branch"],
    B28029: ["RDSB", "Rainbow District School Board"],
    B28053: ["RRDSB", "Rainy River District School Board"],
    B67199: ["RCCDSB", "Renfrew County Catholic District School Board"],
    B66214: ["RCDSB", "Renfrew County District School Board"],
    B66109: ["SCDSB", "Simcoe County District School Board"],
    B67091: ["SMCDSB", "Simcoe Muskoka Catholic District School Board"],
    B67040: ["SCCDSB", "St. Clair Catholic District School Board"],
    B29033: ["SCDSB", "Sudbury Catholic District School Board"],
    B29076: ["SNCDSB", "Superior North Catholic District School Board"],
    B28070: ["SGDSB", "Superior-Greenstone District School Board"],
    B66044: ["TVDSB", "Thames Valley District School Board"],
    B29068: ["TBCDSB", "Thunder Bay Catholic District School Board"],
    B67059: ["TCDSB", "Toronto Catholic District School Board"],
    B66052: ["TDSB", "Toronto District School Board"],
    B66087: ["TLDSB", "Trillium Lakelands District School Board"],
    B66192: ["UCDSB", "Upper Canada District School Board"],
    B66117: ["UGDSB", "Upper Grand District School Board"],
    B67148: ["WCDSB", "Waterloo Catholic District School Board"],
    B66176: ["WRDSB", "Waterloo Region District School Board"],
    B67130: ["WCDSB", "Wellington Catholic District School Board"],
    B67024: ["WECDSB", "Windsor-Essex Catholic District School Board"],
    B67075: ["YCDSB", "York Catholic District School Board"],
    B66095: ["YRDSB", "York Region District School Board"]
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
      const label = aliases.length >= 2 ? aliases.slice(0, 2).join(" · ")
        : aliases.length === 1 ? `${aliases[0]} · ${name}` : name;
      return [[id, label]];
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
    const controller = new AbortController();
    const configuredTimeout = Number(window.H4_TEACHER_FORM_CONFIG?.timeoutMs);
    const timeoutId = setTimeout(() => controller.abort(), configuredTimeout > 0 ? configuredTimeout : 20000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, submissionKey: lastAttempt.key }),
        signal: controller.signal
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
    } catch (err) {
      showError(err?.name === "AbortError"
        ? "The request timed out before we could confirm it saved. Your details are still here. Please try again."
        : "We couldn’t confirm your request. Your details are still here. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      sending = false;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      updateInterest();
    }
  });

  window.__h4TeacherForm = { selectInterest, getSelectedInquiryType: inquiryType };
})();
