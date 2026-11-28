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

  const POPULAR_BOARD_IDS = [
    "B67059", // Toronto Catholic District School Board (TCDSB)
    "B66052", // Toronto District School Board (TDSB)
    "B66095", // York Region District School Board (YRDSB)
    "B67075", // York Catholic District School Board (YCDSB)
    "B66060", // Durham District School Board (DDSB)
    "B67105"  // Durham Catholic District School Board (DCDSB)
  ];
  const POPULAR_BOARD_SET = new Set(POPULAR_BOARD_IDS);
  const POPULAR_BOARD_LABELS = {
    B67059: "TCDSB · Toronto Catholic DSB",
    B66052: "TDSB · Toronto DSB",
    B66095: "YRDSB · York Region DSB",
    B67075: "YCDSB · York Catholic DSB",
    B66060: "DDSB · Durham DSB",
    B67105: "DCDSB · Durham Catholic DSB"
  };

  let activeInterest = "";
  let sending = false;
  let lastAttempt;

  const normalize = (value) => String(value || "").toLowerCase().normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\bste\.?\b/g, "sainte")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bst\./g, "st ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

  const boardById = new Map(
    Object.entries(H4_SCHOOL_DIRECTORY).map(([id, [name]]) => {
      const aliases = boardAliases[id] || [];
      const acronym = aliases[0] || "";
      const label = POPULAR_BOARD_LABELS[id]
        || (acronym && !name.toLowerCase().startsWith(acronym.toLowerCase()) ? `${acronym} · ${name}` : name);
      return [id, { id, name, label, isPopular: POPULAR_BOARD_SET.has(id), searchLabels: [name, label, ...aliases] }];
    })
  );

  const popularBoards = POPULAR_BOARD_IDS.map((id) => boardById.get(id)).filter(Boolean);
  const otherBoards = [...boardById.values()]
    .filter((entry) => !POPULAR_BOARD_SET.has(entry.id))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const allBoards = [...popularBoards, ...otherBoards];

  function syncComboboxViewportHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!vh) return;
    const maxH = Math.max(140, Math.min(320, Math.round(vh * 0.45)));
    document.documentElement.style.setProperty("--combobox-max-h", `${maxH}px`);
  }

  syncComboboxViewportHeight();
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncComboboxViewportHeight);
  }
  window.addEventListener("resize", syncComboboxViewportHeight);

  function clearFieldError(input) {
    if (!input || !input.id) return;
    input.setAttribute("aria-invalid", "false");
    input.classList.remove("is-field-invalid");
    const errEl = field(`${input.id}Error`);
    if (errEl) {
      errEl.textContent = "";
      errEl.hidden = true;
    }
  }

  function createCombobox({
    input, hiddenInput, listbox, clearBtn, searchIcon, optionPrefix,
    getItems, getGroups, maxVisibleItems, hintTemplate,
    fallbackItem, emptyMessage, onSelect, onClear
  }) {
    let currentItems = [];
    let activeIndex = -1;
    let selectedLabel = "";
    const wrap = input.closest(".combobox-wrap");

    function syncClearIcon() {
      const hasText = Boolean(input.value.trim()) && !input.disabled;
      clearBtn.hidden = !hasText;
      searchIcon.toggleAttribute("hidden", hasText);
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

    function buildOptionEl(item, index) {
      const li = document.createElement("li");
      li.id = `${optionPrefix}-${index}`;
      li.className = "combobox-option" + (item === fallbackItem ? " combobox-option-fallback" : "");
      li.setAttribute("role", "option");
      li.dataset.value = item.id;
      li.setAttribute("aria-selected", item.id === hiddenInput.value ? "true" : "false");
      li.textContent = item.label;
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      li.addEventListener("click", () => choose(item));
      return li;
    }

    function render(query) {
      syncComboboxViewportHeight();
      listbox.replaceChildren();
      currentItems = [];
      let totalMatched = 0;

      if (getGroups && !query.trim()) {
        const groups = getGroups();
        for (const group of groups) {
          if (!group.items.length) continue;
          const heading = document.createElement("li");
          heading.className = "combobox-group-label";
          heading.setAttribute("role", "presentation");
          heading.textContent = group.heading;
          listbox.appendChild(heading);
          for (const item of group.items) {
            const idx = currentItems.length;
            currentItems.push(item);
            listbox.appendChild(buildOptionEl(item, idx));
          }
          totalMatched += group.items.length;
        }
      } else {
        const matched = getItems(query);
        totalMatched = matched.length;
        const visible = maxVisibleItems && matched.length > maxVisibleItems
          ? matched.slice(0, maxVisibleItems)
          : matched;
        if (!matched.length && query.trim()) {
          const empty = document.createElement("li");
          empty.className = "combobox-empty";
          empty.setAttribute("role", "presentation");
          empty.textContent = emptyMessage;
          listbox.appendChild(empty);
        }
        for (const item of visible) {
          const idx = currentItems.length;
          currentItems.push(item);
          listbox.appendChild(buildOptionEl(item, idx));
        }
        if (maxVisibleItems && matched.length > maxVisibleItems && hintTemplate) {
          const hint = document.createElement("li");
          hint.className = "combobox-hint";
          hint.setAttribute("role", "presentation");
          hint.textContent = hintTemplate(visible.length, matched.length);
          listbox.appendChild(hint);
        }
      }

      const fallbackIndex = currentItems.length;
      currentItems.push(fallbackItem);
      listbox.appendChild(buildOptionEl(fallbackItem, fallbackIndex));

      listbox.hidden = false;
      listbox.scrollTop = 0;
      input.setAttribute("aria-expanded", "true");
      setActive(totalMatched > 0 && query.trim() ? 0 : -1);
    }

    function choose(item) {
      hiddenInput.value = item.id;
      selectedLabel = item.label;
      input.value = item.label;
      clearFieldError(input);
      close();
      syncClearIcon();
      onSelect(item.id, item.label);
    }

    function clearValue(shouldFocus = false) {
      hiddenInput.value = "";
      selectedLabel = "";
      input.value = "";
      clearFieldError(input);
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
      } else if (event.key === "Home" && !listbox.hidden) {
        event.preventDefault();
        setActive(0);
      } else if (event.key === "End" && !listbox.hidden) {
        event.preventDefault();
        setActive(currentItems.length - 1);
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
      }, 150);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!listbox.hidden && wrap && !wrap.contains(event.target)) {
        close();
      }
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
        clearFieldError(input);
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
    schoolSearch.placeholder = schoolEnabled ? "Start typing your school name..." : "Select a board first";
    schoolSearch.required = schoolEnabled && isWorkshopInterest(activeInterest);
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
    maxVisibleItems: 60,
    hintTemplate: (shown, total) => `Showing ${shown} of ${total} schools — keep typing to narrow results`,
    getItems(query) {
      const schools = H4_SCHOOL_DIRECTORY[boardId.value]?.[1] || {};
      const clean = normalize(query);
      const list = Object.entries(schools).flatMap(([id, [name, city]]) => {
        if (!matches(query, [name, city])) return [];
        const normName = normalize(name);
        const rank = !clean ? 0
          : normName.startsWith(clean) ? 0
          : normName.split(" ").some((w) => w.startsWith(clean)) ? 1
          : 2;
        return [{ id, label: city ? `${name} · ${city}` : name, rank }];
      });
      if (!clean) return list;
      return list.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
    },
    fallbackItem: { id: "manual", label: "Can't find your school? Enter it manually." },
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
    getGroups() {
      return [
        { heading: "Popular school boards", items: popularBoards },
        { heading: "All other school boards", items: otherBoards }
      ];
    },
    getItems(query) {
      const matched = allBoards.filter((entry) => matches(query, entry.searchLabels));
      if (!query.trim()) return matched;
      return matched.sort((a, b) => {
        const exactDiff = Number(isExactMatch(query, b.searchLabels)) - Number(isExactMatch(query, a.searchLabels));
        if (exactDiff !== 0) return exactDiff;
        const popularDiff = Number(b.isPopular) - Number(a.isPopular);
        if (popularDiff !== 0) return popularDiff;
        return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      });
    },
    fallbackItem: { id: "other", label: "Other / Not listed (enter manually)" },
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
      clearFieldError(el);
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
      field("programInterestLabel").textContent = programInterestSelect.selectedOptions[0]?.textContent || "";
    }

    // Full name: visible & required on all pathways (Free Tutorial has 3 required fields: Name, Email, Role)
    fullNameField.hidden = false;
    teacherName.disabled = false;
    teacherName.required = true;

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
    for (const mark of schoolDetails.querySelectorAll(".school-opt-mark")) {
      mark.hidden = showWorkshopSchool;
    }
    boardCombobox.syncClearIcon();
    syncSchoolPickerState();

    // Workshop optional details (Grades, Preferred Timing, Phone — Instagram hidden on all pathways)
    optionalWorkshopDetails.hidden = !isWorkshop;
    if (!isWorkshop) optionalWorkshopDetails.open = false;
    for (const control of workshopDetails.querySelectorAll("input, select")) {
      control.disabled = !isWorkshop;
    }
    if (instagramField) instagramField.hidden = true;
    if (teacherInstagram) teacherInstagram.disabled = true;

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
      const errEl = input.id ? field(`${input.id}Error`) : null;
      if (errEl) {
        errEl.textContent = message;
        errEl.hidden = false;
      }
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
    if (sending) return;
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
      if (sending) return;
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
  role.addEventListener("change", () => { if (!sending) updateView(); });
  form.addEventListener("input", (event) => {
    if (!sending) error.hidden = true;
    clearFieldError(event.target);
  });
  form.addEventListener("change", (event) => {
    if (!sending) error.hidden = true;
    clearFieldError(event.target);
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

    if (!teacherName.value.trim()) {
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
        showError("Please select your school or choose ‘Can't find your school? Enter it manually.’", schoolSearch);
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
      fullName: teacherName.value.trim(),
      email: teacherEmail.value.trim(),
      boardId: activeBoardId,
      schoolId: activeSchoolId,
      schoolName: activeSchoolName,
      phone: isWorkshop ? teacherPhone.value.trim() : "",
      instagram: "",
      grades: activeGrades,
      preferredTiming: isWorkshop ? (targetMonth.value || "") : "",
      website: form.elements.website?.value || ""
    };

    const snapshot = JSON.stringify(payload);
    if (lastAttempt?.snapshot !== snapshot) lastAttempt = { snapshot, key: crypto.randomUUID() };

    const controls = Array.from(form.querySelectorAll("button, input, select, textarea"))
      .filter((control) => !control.disabled);
    const disclosures = Array.from(form.querySelectorAll("summary"));
    const sendingStatus = field("formSendingStatus");
    sending = true;
    boardCombobox.close();
    schoolCombobox.close();
    controls.forEach((control) => { control.disabled = true; });
    disclosures.forEach((summary) => { summary.inert = true; });
    sendingStatus.hidden = false;
    sendingStatus.focus({ preventScroll: true });
    form.setAttribute("aria-busy", "true");
    submit.classList.add("is-loading");
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
      controls.forEach((control) => { control.disabled = false; });
      disclosures.forEach((summary) => { summary.inert = false; });
      sendingStatus.hidden = true;
      submit.classList.remove("is-loading");
      form.removeAttribute("aria-busy");
      if (form.hidden === false) updateView();
    }
  });

  // Start directly on the 3-choice chooser with no choice selected
  updateView({ focus: false });

  window.__h4TeacherForm = {
    selectInterest,
    isSending: () => sending,
    returnToChooser,
    getSelectedInquiryType: () => activeInterest,
    selectBoardById: (id) => !sending && boardCombobox.chooseById(id),
    selectSchoolById: (id) => !sending && schoolCombobox.chooseById(id)
  };
})();
