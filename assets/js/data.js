/* =========================================================================
   NMK42003 Instrumentation — course data
   -------------------------------------------------------------------------
   This is the ONLY file you need to edit each semester.
   Source: NMK42003 Teaching and Learning Plan (TLP) v1.2, Semester 1 2026/2027.
   ========================================================================= */

const COURSE = {
  code: "NMK42003",
  name: "Instrumentation",
  session: "Semester 1 2026/2027",
  faculty: "Faculty of Electronic Engineering & Technology",
  university: "Universiti Malaysia Perlis (UniMAP)",
  programme: "UR6523007 - Bachelor of Electronic Engineering Technology (Electronic Systems)",
  credits: 3,
  mode: "Blended",
  prerequisites: ["NMK20103 Microprocessor", "NMK21303 Analog Electronic II"],
  sdg: "SDG 9: Industry, Innovation and Infrastructure",
  lastUpdated: "26 September 2026",

  // Monday of Week 1 (YYYY-MM-DD). Every other week date is calculated from this.
  semesterStart: "2026-10-05",

  synopsis:
    "This course covers the fundamentals of electronic instrumentation. At its core is the " +
    "embedded controller, which drives sensors and actuators. You will study how transducers " +
    "and sensors work, how their signals are conditioned, and how data is converted, acquired " +
    "and transmitted. The course then moves to local and networked instrumentation, wireless " +
    "sensor networks, and sending acquired data from embedded controllers and smart sensors to " +
    "cloud storage where it can be shared and acted on.",

  /* ---------------- Teaching team ---------------- */
  team: [
    {
      name: "Ts. Dr. Mohd Zamri Bin Zahir Ahmad",
      role: "Course coordinator and lecturer",
      email: "zamrizahir@unimap.edu.my",
      link: "https://zamrizahir88.github.io/cv/main",
      initials: "MZ",
      photo: "assets/img/team/zamri.jpg" // leave empty to show initials
    },
    {
      name: "Ts. Dr. Hariyanti Binti Mohd Saleh",
      role: "Teaching lecturer",
      email: "hariyanti@unimap.edu.my",
      link: "",
      initials: "HS",
      photo: "assets/img/team/hariyanti.jpg"
    }
  ],

  developer: {
    name: "Ts. Dr. Mohd Zamri Bin Zahir Ahmad",
    affiliation: "Faculty of Electronic Engineering & Technology, UniMAP",
    link: "https://zamrizahir88.github.io/cv/main"
  },

  /* ---------------- Course outcomes (TLP v1.2, section B2) ---------------- */
  outcomes: [
    {
      id: "CO1",
      level: "C4 Analysing",
      po: "PO2",
      text: "Analyse electronic instrumentation including embedded controllers, sensors, actuators, data acquisition, and storage in electronic system applications."
    },
    {
      id: "CO2",
      level: "C6 Creating",
      po: "PO3",
      text: "Design local systems, wired and wireless network systems, and internet and cloud-based data storage."
    },
    {
      id: "CO3",
      level: "P4 Mechanism",
      po: "PO5",
      text: "Operate engineering tools to implement instrumentation designs in electronic system applications with precision."
    }
  ],

  /* ---------------- Assessment (TLP v1.2, section D) ---------------- */
  assessment: [
    { name: "Final examination", pct: 40, kind: "final",
      detail: "Individual. Q1 and Q2 assess CO1 (30%), Q3 assesses CO2 (10%). Held during exam weeks 17 to 19." },
    { name: "Lab assessment", pct: 20, kind: "lab",
      detail: "Individual. Five lab reports assessing CO3." },
    { name: "Quizzes", pct: 15, kind: "quiz",
      detail: "Individual. Three quizzes on URLearn: CO1 (10%) and CO2 (5%)." },
    { name: "Mini project", pct: 15, kind: "project",
      detail: "Group work assessing CO3. Assigned in week 8, assessed in week 15." },
    { name: "Test", pct: 10, kind: "test",
      detail: "Individual. One test in week 8 assessing CO1." }
  ],

  /* ---------------- Topics (chapters) ----------------
     status: "soon" | "notes" | "interactive" | "building"
     page:   optional link to a built chapter page, e.g. "chapter-5.html".
             Leave it out to use the placeholder page topic.html?ch=N.      */
  topics: [
    { no: 1, title: "Introduction to Electronic Instrumentation", weeks: "Week 1", status: "interactive", page: "chapter-1.html", exercises: { count: 6, prefix: "c1-" },
      summary: "Characteristics and types of instruments and indicators, standard units, measurement error, precision, and error limits." },
    { no: 2, title: "Embedded Controller", weeks: "Weeks 2 to 3", status: "interactive", page: "chapter-2.html", exercises: { count: 10, prefix: "c2-" },
      summary: "Types of embedded controllers, interfacing through digital I/O, analog, UART, SPI and I²C, Bluetooth and WiFi connectivity, and programming tools." },
    { no: 3, title: "Transducers, Sensors and Actuators", weeks: "Week 4", status: "interactive", page: "chapter-3.html", exercises: { count: 12, prefix: "c3-" },
      summary: "Sensor parameters shown in real situations, passive (resistive, capacitive, inductive) and active (piezoelectric, photodiode, Hall effect) sensors, and actuators (LED, DC motor, servo, relay)." },
    { no: 4, title: "Transduction Techniques", weeks: "Week 5", status: "interactive", page: "chapter-4.html", exercises: { count: 12, prefix: "c4-" },
      summary: "Transduction circuits for passive sensors (voltage divider, Wheatstone bridge, 555 timing circuit, LC tuned circuit) and for active sensors (the piezo and its resistor)." },
    { no: 5, title: "Signal Conditioning (Amplifiers & Filters)", weeks: "Week 5", status: "interactive", page: "chapter-5.html", exercises: { count: 7, prefix: "ex-" },
      summary: "Op-amp amplifiers (voltage follower, inverting, non-inverting, differential) and passive and active low-pass, high-pass, band-pass and band-stop filters." },
    { no: 6, title: "Data Conversion and Acquisition", weeks: "Week 6", status: "interactive", page: "chapter-6.html", exercises: { count: 12, prefix: "c6-" },
      summary: "Digital codes, binary-weighted and R-2R DACs, counter and successive-approximation ADCs, ADC resolution and output code, and the ESP32's own DAC and ADC." },
    { no: 7, title: "Transducer Calibration", weeks: "Week 7", status: "interactive", page: "chapter-7.html", exercises: { count: 6, prefix: "c7-" },
      summary: "What calibration is and why, the five calibration steps, and a virtual lab to calibrate a potentiometer angle sensor and a capacitive water-level sensor with the ESP32." }
  ],

  /* ---------------- Labs (TLP v1.2, section B4) ---------------- */
  // page: the lab's virtual lab (simulation) page, once built
  labs: [
    { no: 1, title: "Lab 1: Introduction (Software & Hardware)", weeks: "Weeks 1 to 2", openEnded: false, page: "lab-1.html",
      summary: "Power and program the ESP32, blink its LED, upload over Wi-Fi (OTA), and switch LEDs from a phone by Bluetooth, an MIT App Inventor app and a web page." },
    { no: 2, title: "Lab 2: Transduction and Conversion Calibration", weeks: "Week 4", openEnded: true, page: "lab-2.html",
      summary: "Turn a potentiometer into an angle sensor: power it safely, read the ESP32's ADC, calibrate it against a protractor with a straight-line fit, and show the angle on a phone and a web page." },
    { no: 3, title: "Lab 3: Smart Sensors", weeks: "Week 6", openEnded: true, page: "lab-3.html",
      summary: "Read RFID cards with a phone and with an RC522 reader on the ESP32, show text on an I2C 16 × 4 LCD, and merge the two into a standalone card reader and a security system." },
    { no: 4, title: "Lab 4: Local Data Acquisition (DAQ)", weeks: "Week 11", openEnded: false },
    { no: 5, title: "Lab 5: Cloud Storage and IoT Instrumentation", weeks: "Week 13", openEnded: false }
  ],

  references: [
    "William Bolton, Instrumentation and Control Systems, 2nd ed., Newnes, 2015.",
    "David A. Bell, Electronic Instrumentation and Measurements, 3rd ed., Oxford University Press, 2013.",
    "Alan S. Morris and Reza Langari, Measurement and Instrumentation: Theory and Application, 2nd ed., Academic Press, 2015."
  ],

  /* ---------------- Weekly plan (TLP v1.2, section C) ----------------
     tags:  lab | quiz | test | report | project | online | break | holiday | exam | study
     weight: % of the final grade assessed that week, used for the semester trace.
             TLP gives totals only, so labs are split evenly (20% / 5 = 4%) and
             quizzes evenly (15% / 3 = 5%). Adjust if your marking differs.          */
  weeks: [
    { w: 1, topic: "Introduction to Electronic Instrumentation",
      sub: "Characteristics and types of instrumentation and indicators. Standard units, error measurements, precision, types of error, and error limits.",
      activities: ["Lecture", "Lab 1 (Part 1)"], assessments: [], notes: [], tags: ["lab"], weight: 0 },
    { w: 2, topic: "Embedded Controller",
      sub: "Types of embedded controllers. Interfacing: digital I/O, analog, UART, SPI, I²C.",
      activities: ["Lecture", "Lab 1 (Part 2)"], assessments: ["Lab Report 1"], notes: [], tags: ["lab", "report"], weight: 4 },
    { w: 3, topic: "Embedded Controller (continued)",
      sub: "Connectivity: Bluetooth and WiFi. Programming tools.",
      activities: ["Lecture"], assessments: ["Quiz 1"], notes: ["Online lecture", "Quiz through URLearn"], tags: ["quiz", "online"], weight: 5 },
    { w: 4, topic: "Transducers and Sensors",
      sub: "Types; electrical transducers; class; selection of transducers.",
      activities: ["Lecture", "Lab 2"], assessments: ["Lab Report 2"], notes: [], tags: ["lab", "report"], weight: 4 },
    { w: 5, topic: "Transduction Techniques",
      sub: "Generating electrical signals, i.e. voltage, current, PWM. Signal conditioning techniques.",
      activities: ["Lecture", "Tutorial 1"], assessments: [], notes: ["Deepavali, 8 November"], tags: ["holiday"], weight: 0 },
    { w: 6, topic: "Data Conversion and Acquisition",
      sub: "ADC and DAC. Conversion types, interfacing, and programming.",
      activities: ["Lecture", "Lab 3"], assessments: ["Lab Report 3"], notes: [], tags: ["lab", "report"], weight: 4 },
    { w: 7, topic: "Data Calibration",
      sub: "Setup and calibration techniques. Standard.",
      activities: ["Lecture", "Tutorial 2"], assessments: ["Quiz 2"], notes: ["Online lecture", "Quiz through URLearn", "Convocation week"], tags: ["quiz", "online"], weight: 5 },
    { w: 8, topic: "Data Transmission Techniques",
      sub: "Types: analog, UART, SPI, I²C, Bluetooth, WiFi.",
      activities: ["Lecture"], assessments: ["Test"], notes: ["Online lecture", "Mini project assigned"], tags: ["test", "online", "project"], weight: 10 },
    { w: 9, topic: "Mid-term break", sub: "", activities: [], assessments: [], notes: [], tags: ["break"], weight: 0 },
    { w: 10, topic: "Smart/Embedded Sensors",
      sub: "Interfacing types and programming.",
      activities: ["Lecture"], assessments: [], notes: [], tags: [], weight: 0 },
    { w: 11, topic: "Local Data Acquisition System",
      sub: "Microcontroller-based and PC-based design, setup and programming.",
      activities: ["Lecture", "Lab 4"], assessments: ["Lab Report 4"], notes: ["Online lecture"], tags: ["lab", "report", "online"], weight: 4 },
    { w: 12, topic: "Wired and Wireless Sensor Network",
      sub: "Sensor network, design and topology, advantages and disadvantages.",
      activities: ["Lecture"], assessments: [], notes: [], tags: [], weight: 0 },
    { w: 13, topic: "Network Data Acquisition System",
      sub: "Local area network, design and topology.",
      activities: ["Lecture", "Lab 5"], assessments: ["Lab Report 5"], notes: ["Quiz through URLearn"], tags: ["lab", "report"], weight: 4 },
    { w: 14, topic: "Data Storage",
      sub: "Local and cloud storage and retrieval.",
      activities: ["Lecture", "Mini project discussion (sync)"], assessments: ["Quiz 3"], notes: [], tags: ["quiz", "project"], weight: 5 },
    { w: 15, topic: "IoT Based Instrumentation",
      sub: "Home, education, industry, agriculture.",
      activities: ["Lecture", "Tutorial 3"], assessments: ["Mini project assessment"], notes: [], tags: ["project"], weight: 15 },
    { w: 16, topic: "Study week", sub: "", activities: [], assessments: [], notes: [], tags: ["study"], weight: 0 },
    { w: 17, topic: "Exam week", sub: "", activities: [], assessments: ["Final examination"], notes: [], tags: ["exam"], weight: 0 },
    { w: 18, topic: "Exam week", sub: "", activities: [], assessments: ["Final examination"], notes: [], tags: ["exam"], weight: 0 },
    { w: 19, topic: "Exam week", sub: "", activities: [], assessments: ["Final examination"], notes: [], tags: ["exam"], weight: 40 }
  ]
};
