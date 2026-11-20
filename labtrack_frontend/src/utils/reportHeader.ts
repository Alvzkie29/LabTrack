/**
 * The letterhead printed at the top of the weekly laboratory report, copied from the
 * Laboratory Management Office's template. Edit the text here; it is the same for every report.
 *
 * The logo is not part of the app's code: save the office's own logo file as
 * `public/um-logo.png` in the frontend folder. If the file is missing, the university's
 * name is printed in its place.
 */
export const REPORT_HEADER = {
  logoPath: "/um-logo.png",
  institution: "The University of Mindanao",

  // Right-hand block, in order. CHECK these against the original template: the sample
  // screenshot cut off the end of each line, and the local number was not visible.
  office: "Laboratory Management Office",
  addressLines: [
    "Rm. No. 227 Second Floor, BE Building",
    "Maa Campus, Matina, Davao City",
    "Phone No.: (082) 244-3400 Local",
  ],

  // Printed before the laboratory name: "DEPARTMENT:  CCE - COMPUTING LABORATORY 5".
  department: "CCE",
};
