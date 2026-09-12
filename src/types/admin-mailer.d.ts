// Alias avoids activating Auth.js's optional, older Nodemailer peer dependency.
declare module "admin-mailer" {
  import nodemailer from "nodemailer";
  export = nodemailer;
}
