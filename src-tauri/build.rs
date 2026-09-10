fn main() {
    let dist_dir = std::path::Path::new("../dist");
    if !dist_dir.exists() {
        let _ = std::fs::create_dir_all(dist_dir);
        let index_html = dist_dir.join("index.html");
        if !index_html.exists() {
            let _ = std::fs::write(
                index_html,
                "<!DOCTYPE html><html><head><title>Aerial</title></head><body></body></html>",
            );
        }
    }
    tauri_build::build()
}
