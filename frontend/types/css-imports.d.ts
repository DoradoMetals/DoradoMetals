// TypeScript 7 checks side-effect imports that 5.9 silently ignored (TS2882),
// and CSS is not its to resolve - the bundler owns these. Declared once here
// for the app's own stylesheets and swiper's subpath exports, which end in
// /css rather than .css and so need naming explicitly.
declare module "*.css";
declare module "swiper/css";
declare module "swiper/css/*";
