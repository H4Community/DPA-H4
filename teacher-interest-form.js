(() => {
  const form = document.getElementById("workshopForm");
  const field = (id) => document.getElementById(id);
  const chooser = field("signupChooser");
  const chooserHeading = field("signupChooserHeading");
  const formHeading = field("bookingFormHeading");
  const inquiryInput = field("inquiryTypeInput");
  const programInterestField = field("programInterestField");
  const programInterestSelect = field("programInterestSelect");
  const fullNameField = field("fullNameField");
  const teacherName = field("teacherName");
  const teacherEmail = field("teacherEmail");
  const role = field("signupRole");
  const workshopSchoolSlot = field("workshopSchoolSlot");
  const optionalSchoolDetails = field("optionalSchoolDetails");
  const optionalSchoolBody = field("optionalSchoolBody");
  const schoolDetails = field("signupSchoolDetails");
  const boardSearch = field("boardSearch");
  const boardId = field("boardId");
  const boardListbox = field("boardListbox");
  const boardClearBtn = field("boardClearBtn");
  const boardSearchIcon = field("boardSearchIcon");
  const schoolPicker = field("schoolPicker");
  const schoolSearch = field("schoolSearch");
  const schoolId = field("schoolId");
  const schoolListbox = field("schoolListbox");
  const schoolClearBtn = field("schoolClearBtn");
  const schoolSearchIcon = field("schoolSearchIcon");
  const manualField = field("manualSchoolField");
  const manualName = field("schoolName");
  const optionalWorkshopDetails = field("optionalWorkshopDetails");
  const workshopDetails = field("workshopDetails");
  const instagramField = field("instagramFieldWrap");
  const teacherInstagram = field("teacherInstagram");
  const teacherPhone = field("teacherPhone");
  const targetMonth = field("targetMonth");
  const submit = field("workshopSubmitBtn");
  const error = field("formError");
  const confirmation = field("formReadyPanel");
  const choiceButtons = [...chooser.querySelectorAll("[data-interest-choice]")];

  const SCHOOL_PROGRAMS = [
    "Hip-Hop & Breaking Workshops",
    "DPA & Classroom Dance",
    "Multi-Session Dance Programs",
    "School-Wide Events & Celebrations",
    "Full-Day School Workshop"
  ];
  const WORKSHOP = "Hip-Hop & Breaking Workshops";
  const FREE_VIDEOS = "Free Teacher Tutorial";
  const FREE_VIDEOS_ALIASES = ["Free Teacher Tutorial", "Free Online Dance Tutorial"];
  const LEARN_MORE = "Other / Let's Explore";
  const LEARN_MORE_ALIASES = ["Other / Let's Explore", "Learn More"];
  const ALL_INTERESTS = [...SCHOOL_PROGRAMS, ...FREE_VIDEOS_ALIASES, ...LEARN_MORE_ALIASES];

  const isWorkshopInterest = (value) => SCHOOL_PROGRAMS.includes(value);
  const isFreeInterest = (value) => FREE_VIDEOS_ALIASES.includes(value);
  const isExploreInterest = (value) => LEARN_MORE_ALIASES.includes(value);
  const getPathKey = (value) => (isWorkshopInterest(value) ? "workshop" : isFreeInterest(value) ? "free" : isExploreInterest(value) ? "explore" : "");

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

  let activeInterest = "";
  let sending = false;
  let lastAttempt;

  const normalize = (value) => value.toLowerCase().normalize("NFD")
    .replace(/\p{M}/gu, "").replace(/\bste\.?\b/g, "sainte").replace(/\bsaint\b/g, "st")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  const matches = (query, labels) => {
    const clean = normalize(query);
    if (!clean) return true;
    const tokens = clean.split(/\s+/);
    const combined = normalize(labels.join(" "));
    return tokens.every((token) => combined.includes(token));
  };

  const isExactMatch = (query, labels) => {
    const clean = normalize(query);
    return Boolean(clean) && labels.some((label) => normalize(label) === clean);
  };

  const allBoards = Object.entries(H4_SCHOOL_DIRECTORY).map(([id, [name]]) => {
    const aliases = boardAliases[id] || [];
    const label = aliases.length >= 2 ? aliases.slice(0, 2).join(" · ")
      : aliases.length === 1 ? `${aliases[0]} · ${name}` : name;
    return { id, label, searchLabels: [name, ...aliases] };
  });

  function createCombobox({
    input, hiddenInput, listbox, clearBtn, searchIcon, optionPrefix,
    getItems, fallbackItem, emptyMessage, onSelect, onClear
  }) {
    let currentItems = [];
    let activeIndex = -1;
    let selectedLabel = "";

    function syncClearIcon() {
      const hasText = Boolean(input.value.trim()) && !input.disabled;
      clearBtn.hidden = !hasText;
      searchIcon.hidden = hasText;
    }

    function setActive(index) {
      const options = [...listbox.querySelectorAll('[role="option"]')];
      activeIndex = options.length ? Math.max(-1, Math.min(index, options.length - 1)) : -1;
      options.forEach((opt, i) => opt.classList.toggle("is-active", i === activeIndex));
      if (activeIndex >= 0) {
        input.setAttribute("aria-activedescendant", options[activeIndex].id);
        options[activeIndex].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function close() {
      listbox.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
    }

    function render(query) {
      const matched = getItems(query);
      currentItems = [...matched, fallbackItem];
      listbox.replaceChildren();
      if (!matched.length && query.trim()) {
        const empty = document.createElement("li");
        empty.className = "combobox-empty";
        empty.setAttribute("role", "presentation");
        empty.textContent = emptyMessage;
        listbox.appendChild(empty);
      }
      currentItems.forEach((item, index) => {
        const li = document.createElement("li");
        li.id = `${optionPrefix}-${index}`;
        li.className = "combobox-option" + (item === fallbackItem ? " combobox-option-fallback" : "");
        li.setAttribute("role", "option");
        li.dataset.value = item.id;
        li.setAttribute("aria-selected", item.id === hiddenInput.value ? "true" : "false");
        li.textContent = item.label;
        li.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(item);
        });
        li.addEventListener("click", () => choose(item));
        listbox.appendChild(li);
      });
      listbox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setActive(matched.length > 0 && query.trim() ? 0 : -1);
    }

    function choose(item) {
      hiddenInput.value = item.id;
      selectedLabel = item.label;
      input.value = item.label;
      input.setAttribute("aria-invalid", "false");
      input.classList.remove("is-field-invalid");
      close();
      syncClearIcon();
      onSelect(item.id, item.label);
    }

    function clearValue(shouldFocus = false) {
      hiddenInput.value = "";
      selectedLabel = "";
      input.value = "";
      input.setAttribute("aria-invalid", "false");
      input.classList.remove("is-field-invalid");
      close();
      syncClearIcon();
      onClear();
      if (shouldFocus && !input.disabled) input.focus();
    }

    input.addEventListener("focus", () => {
      if (input.disabled) return;
      render(hiddenInput.value && input.value === selectedLabel ? "" : input.value);
    });

    input.addEventListener("click", () => {
      if (input.disabled) return;
      if (listbox.hidden) render(hiddenInput.value && input.value === selectedLabel ? "" : input.value);
    });

    input.addEventListener("input", () => {
      if (hiddenInput.value && input.value !== selectedLabel) {
        hiddenInput.value = "";
        selectedLabel = "";
        onClear();
      }
      syncClearIcon();
      render(input.value);
    });

    input.addEventListener("keydown", (event) => {
      if (event.isComposing || input.disabled) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (listbox.hidden) render(hiddenInput.value && input.value === selectedLabel ? "" : input.value);
        setActive(activeIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!listbox.hidden) setActive(activeIndex <= 0 ? 0 : activeIndex - 1);
      } else if (event.key === "Enter" && !listbox.hidden) {
        event.preventDefault();
        const pickIndex = activeIndex >= 0 ? activeIndex : (currentItems.length === 2 && !listbox.querySelector(".combobox-empty") ? 0 : -1);
        if (pickIndex >= 0 && currentItems[pickIndex]) choose(currentItems[pickIndex]);
      } else if (event.key === "Escape" && !listbox.hidden) {
        event.preventDefault();
        close();
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!listbox.contains(document.activeElement)) close();
      }, 120);
    });

    clearBtn.addEventListener("click", () => clearValue(true));

    return {
      chooseById(id) {
        if (!id) {
          clearValue(false);
          return;
        }
        const item = id === fallbackItem.id
          ? fallbackItem
          : getItems("").find((entry) => entry.id === id);
        if (item) choose(item);
      },
      clear: () => clearValue(false),
      setRaw(id, label) {
        hiddenInput.value = id || "";
        selectedLabel = id ? (label || "") : "";
        input.value = label || "";
        input.setAttribute("aria-invalid", "false");
        input.classList.remove("is-field-invalid");
        close();
        syncClearIcon();
      },
      close,
      syncClearIcon
    };
  }

  const emptySchoolState = () => ({ boardId: "", boardText: "", schoolId: "", schoolText: "", manualName: "" });
  const schoolStateByPath = {
    workshop: emptySchoolState(),
    free: emptySchoolState(),
    explore: emptySchoolState()
  };

  function saveSchoolState(interest) {
    const path = getPathKey(interest);
    if (!path) return;
    schoolStateByPath[path] = {
      boardId: boardId.value,
      boardText: boardSearch.value,
      schoolId: schoolId.value,
      schoolText: schoolSearch.value,
      manualName: manualName.value
    };
  }

  function restoreSchoolState(interest) {
    const path = getPathKey(interest);
    const saved = schoolStateByPath[path] || emptySchoolState();
    boardCombobox.setRaw(saved.boardId, saved.boardText);
    schoolCombobox.setRaw(saved.schoolId, saved.schoolText);
    manualName.value = saved.manualName;
  }

  function getCompleteSchoolSelection() {
    const bId = boardId.value;
    const sId = schoolId.value;
    const mName = manualName.value.trim();
    if (bId === "other") {
      return mName ? { boardId: "other", schoolId: "", schoolName: mName } : null;
    }
    if (/^B\d+$/.test(bId) && H4_SCHOOL_DIRECTORY[bId]) {
      if (sId === "manual") {
        return mName ? { boardId: bId, schoolId: "manual", schoolName: mName } : null;
      }
      if (/^\d+$/.test(sId) && H4_SCHOOL_DIRECTORY[bId][1]?.[sId]) {
        return { boardId: bId, schoolId: sId, schoolName: "" };
      }
    }
    return null;
  }

  function updateManualSchool() {
    const schoolActive = !schoolDetails.hidden && !boardSearch.disabled;
    const isOther = boardId.value === "other";
    const isManual = isOther || schoolId.value === "manual";
    const enabled = schoolActive && isManual;
    manualField.hidden = !enabled;
    manualName.disabled = !enabled;
    manualName.required = enabled && isWorkshopInterest(activeInterest);
    if (!enabled) {
      if (schoolActive) manualName.value = "";
      manualName.setAttribute("aria-invalid", "false");
      manualName.classList.remove("is-field-invalid");
    }
  }

  function syncSchoolPickerState() {
    const schoolActive = !schoolDetails.hidden && !boardSearch.disabled;
    const isOther = boardId.value === "other";
    const hasDirectoryBoard = /^B\d+$/.test(boardId.value) && Boolean(H4_SCHOOL_DIRECTORY[boardId.value]);
    schoolPicker.hidden = isOther;
    const schoolEnabled = schoolActive && hasDirectoryBoard && !isOther;
    schoolSearch.disabled = !schoolEnabled;
    schoolSearch.placeholder = schoolEnabled ? "Search schools" : "Select a board first";
    schoolSearch.required = schoolEnabled && activeInterest === WORKSHOP;
    schoolCombobox.syncClearIcon();
    updateManualSchool();
  }

  const schoolCombobox = createCombobox({
    input: schoolSearch,
    hiddenInput: schoolId,
    listbox: schoolListbox,
    clearBtn: schoolClearBtn,
    searchIcon: schoolSearchIcon,
    optionPrefix: "school-opt",
    getItems(query) {
      const schools = H4_SCHOOL_DIRECTORY[boardId.value]?.[1] || {};
      return Object.entries(schools).flatMap(([id, [name, city]]) => {
        if (!matches(query, [name, city])) return [];
        return [{ id, label: city ? `${name} · ${city}` : name }];
      });
    },
    fallbackItem: { id: "manual", label: "My school isn’t listed" },
    emptyMessage: "No matching schools found.",
    onSelect() {
      updateManualSchool();
    },
    onClear() {
      updateManualSchool();
    }
  });

  const boardCombobox = createCombobox({
    input: boardSearch,
    hiddenInput: boardId,
    listbox: boardListbox,
    clearBtn: boardClearBtn,
    searchIcon: boardSearchIcon,
    optionPrefix: "board-opt",
    getItems(query) {
      const matched = allBoards.filter((entry) => matches(query, entry.searchLabels));
      if (!query.trim()) return matched;
      return matched.sort((a, b) => Number(isExactMatch(query, b.searchLabels)) - Number(isExactMatch(query, a.searchLabels)));
    },
    fallbackItem: { id: "other", label: "Independent school / Other" },
    emptyMessage: "No matching school boards found.",
    onSelect() {
      schoolCombobox.clear();
      syncSchoolPickerState();
    },
    onClear() {
      schoolCombobox.clear();
      syncSchoolPickerState();
    }
  });

  function clearValidationVisuals() {
    error.hidden = true;
    for (const el of form.querySelectorAll("input, select")) {
      el.setAttribute("aria-invalid", "false");
      el.classList.remove("is-field-invalid");
    }
  }

  function updateView({ focus = false } = {}) {
    const isSelected = Boolean(activeInterest);
    const isFree = isFreeInterest(activeInterest);
    const isWorkshop = isWorkshopInterest(activeInterest);
    const isExplore = isExploreInterest(activeInterest);
    const isParent = role.value === "Parent / Caregiver";

    inquiryInput.value = activeInterest;
    choiceButtons.forEach((btn) => {
      const choice = btn.dataset.interestChoice;
      const active = (isWorkshop && isWorkshopInterest(choice))
        || (isFree && isFreeInterest(choice))
        || (isExplore && isExploreInterest(choice));
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (!isSelected) {
      chooser.hidden = false;
      form.hidden = true;
      confirmation.hidden = true;
      if (focus) chooserHeading.focus();
      return;
    }

    chooser.hidden = true;
    confirmation.hidden = true;
    form.hidden = false;

    formHeading.textContent = isFree
      ? "Request Your Free Teacher Tutorial"
      : isWorkshop ? "Plan School Programming" : "Other / Let's Explore";

    if (programInterestField && programInterestSelect) {
      const showProgramPicker = isWorkshop || isExplore;
      programInterestField.hidden = !showProgramPicker;
      programInterestSelect.disabled = !showProgramPicker;
      if (showProgramPicker) {
        const matchOption = [...programInterestSelect.options].some((o) => o.value === activeInterest);
        programInterestSelect.value = matchOption ? activeInterest : WORKSHOP;
      }
    }

    // Full name: hidden & disabled on Free Teacher Tutorial (value preserved in DOM for switching)
    fullNameField.hidden = isFree;
    teacherName.disabled = isFree;
    teacherName.required = !isFree;

    // School Board & School placement
    const showOptionalSchool = (isFree || isExplore) && !isParent;
    const showWorkshopSchool = isWorkshop;
    optionalSchoolDetails.hidden = !showOptionalSchool;
    if (!showOptionalSchool) optionalSchoolDetails.open = false;

    if (showWorkshopSchool) {
      workshopSchoolSlot.appendChild(schoolDetails);
      schoolDetails.hidden = false;
    } else if (showOptionalSchool) {
      optionalSchoolBody.appendChild(schoolDetails);
      schoolDetails.hidden = false;
    } else {
      schoolDetails.hidden = true;
    }

    const schoolInteractive = showWorkshopSchool || showOptionalSchool;
    boardSearch.disabled = !schoolInteractive;
    boardSearch.required = showWorkshopSchool;
    for (const mark of schoolDetails.querySelectorAll(".school-req-mark")) {
      mark.hidden = !showWorkshopSchool;
    }
    boardCombobox.syncClearIcon();
    syncSchoolPickerState();

    // Workshop optional details (Grades, Preferred Timing, Phone, Instagram)
    optionalWorkshopDetails.hidden = !isWorkshop;
    if (!isWorkshop) optionalWorkshopDetails.open = false;
    for (const control of workshopDetails.querySelectorAll("input, select")) {
      control.disabled = !isWorkshop;
    }
    instagramField.hidden = !isWorkshop || isParent;
    teacherInstagram.disabled = !isWorkshop || isParent;

    if (!sending) {
      submit.textContent = isFree
        ? "Request Free Tutorial"
        : isWorkshop ? "Send Programming Inquiry" : "Send Inquiry";
    }

    if (focus) formHeading.focus();
  }

  function showError(message, input = error) {
    error.textContent = message;
    error.hidden = false;
    if (input && input !== error) {
      input.setAttribute("aria-invalid", "true");
      input.classList.add("is-field-invalid");
    }
    input.focus();
  }

  function selectInterest(interest, options = {}) {
    if (sending) return;
    if (!ALL_INTERESTS.includes(interest)) return;
    if (confirmation.hidden === false) {
      confirmation.hidden = true;
      lastAttempt = undefined;
    }
    const previous = activeInterest;
    saveSchoolState(previous);
    activeInterest = interest;
    if (getPathKey(previous) !== getPathKey(interest)) {
      optionalSchoolDetails.open = false;
      optionalWorkshopDetails.open = false;
      boardCombobox.close();
      schoolCombobox.close();
      restoreSchoolState(interest);
    }
    clearValidationVisuals();
    updateView({ focus: options.focus !== false });
  }

  function returnToChooser() {
    if (sending) return;
    saveSchoolState(activeInterest);
    activeInterest = "";
    boardCombobox.close();
    schoolCombobox.close();
    clearValidationVisuals();
    updateView({ focus: true });
  }

  function resetForm() {
    form.reset();
    activeInterest = "";
    lastAttempt = undefined;
    schoolStateByPath.workshop = emptySchoolState();
    schoolStateByPath.free = emptySchoolState();
    schoolStateByPath.explore = emptySchoolState();
    boardCombobox.clear();
    schoolCombobox.clear();
    optionalSchoolDetails.open = false;
    optionalWorkshopDetails.open = false;
    clearValidationVisuals();
    updateView({ focus: true });
  }

  choiceButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectInterest(btn.dataset.interestChoice, { focus: true }));
  });
  if (programInterestSelect) {
    programInterestSelect.addEventListener("change", () => {
      const next = programInterestSelect.value;
      if (!ALL_INTERESTS.includes(next)) return;
      const prevPath = getPathKey(activeInterest);
      saveSchoolState(activeInterest);
      activeInterest = next;
      if (prevPath !== getPathKey(next)) {
        restoreSchoolState(next);
      }
      clearValidationVisuals();
      updateView({ focus: false });
    });
  }
  field("changeChoiceBtn").addEventListener("click", returnToChooser);
  role.addEventListener("change", () => updateView());
  form.addEventListener("input", (event) => {
    if (!sending) error.hidden = true;
    event.target.setAttribute("aria-invalid", "false");
    event.target.classList.remove("is-field-invalid");
  });
  form.addEventListener("change", (event) => {
    if (!sending) error.hidden = true;
    event.target.setAttribute("aria-invalid", "false");
    event.target.classList.remove("is-field-invalid");
  });
  field("formEditBtn").addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending || !activeInterest) return;
    clearValidationVisuals();

    const isFree = isFreeInterest(activeInterest);
    const isWorkshop = isWorkshopInterest(activeInterest);
    const isExplore = isExploreInterest(activeInterest);
    const isParent = role.value === "Parent / Caregiver";

    if (!isFree && !teacherName.value.trim()) {
      showError("Please enter your full name.", teacherName);
      return;
    }
    if (!teacherEmail.value.trim() || !teacherEmail.validity.valid) {
      showError("Please enter a valid email address in the format you@example.com.", teacherEmail);
      return;
    }
    if (!role.value) {
      showError("Please select your role.", role);
      return;
    }

    if (isWorkshop) {
      if (!boardId.value) {
        showError("Please select your school board from the list.", boardSearch);
        return;
      }
      if (boardId.value !== "other" && !schoolId.value) {
        showError("Please select your school or choose ‘My school isn’t listed’.", schoolSearch);
        return;
      }
      if ((boardId.value === "other" || schoolId.value === "manual") && !manualName.value.trim()) {
        showError("Please enter your school name.", manualName);
        return;
      }
    }

    const endpoint = (window.H4_TEACHER_FORM_CONFIG?.endpoint || form.dataset.endpoint || "").trim();
    if (!endpoint) {
      showError("Online requests are temporarily unavailable. Please email info@h4community.org.");
      return;
    }

    const selectedSchool = (isWorkshop || ((isFree || isExplore) && !isParent)) ? getCompleteSchoolSelection() : null;
    const activeBoardId = selectedSchool ? selectedSchool.boardId : "";
    const activeSchoolId = selectedSchool ? selectedSchool.schoolId : "";
    const activeSchoolName = selectedSchool ? selectedSchool.schoolName : "";
    const activeGrades = isWorkshop
      ? [...workshopDetails.querySelectorAll('input[name="grades"]:checked')].map((cb) => cb.value)
      : [];

    const payload = {
      interest: activeInterest,
      role: role.value,
      fullName: isFree ? "" : teacherName.value.trim(),
      email: teacherEmail.value.trim(),
      boardId: activeBoardId,
      schoolId: activeSchoolId,
      schoolName: activeSchoolName,
      phone: isWorkshop ? teacherPhone.value.trim() : "",
      instagram: isWorkshop && !isParent ? teacherInstagram.value.trim() : "",
      grades: activeGrades,
      preferredTiming: isWorkshop ? (targetMonth.value || "") : "",
      website: form.elements.website?.value || ""
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
      chooser.hidden = true;
      confirmation.hidden = false;
      field("formReadyTitle").textContent = "Request received";
      field("formReadyBody").textContent = data.emailStatus === "Sent"
        ? "Thanks! Check your inbox for an email from H4 Community."
        : data.emailStatus === "Queued"
          ? "Thanks! Your request is saved and your email is queued. We’ll send it shortly."
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
      if (form.hidden === false) updateView();
    }
  });

  // Start directly on the 3-choice chooser with no choice selected
  updateView({ focus: false });

  window.__h4TeacherForm = {
    selectInterest,
    returnToChooser,
    getSelectedInquiryType: () => activeInterest,
    selectBoardById: (id) => boardCombobox.chooseById(id),
    selectSchoolById: (id) => schoolCombobox.chooseById(id)
  };
})();
