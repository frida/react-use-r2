#include <emscripten.h>
#include <r_core.h>

typedef struct {
  bool placeholder;
} RIOEmscripten;

static bool on_check (RIO * io, const char * pathname, bool many);
static RIODesc * on_open (RIO * io, const char * pathname, int rw, int mode);
static bool on_close (RIODesc * fd);
int on_read (RIO * io, RIODesc * fd, ut8 * buf, int count);
static int on_write (RIO * io, RIODesc * fd, const ut8 * buf, int count);
static ut64 on_seek (RIO * io, RIODesc * fd, ut64 offset, int whence);
static bool on_resize (RIO * io, RIODesc * fd, ut64 count);

static RIOPlugin r_io_plugin_emscripten = {
  .meta = {
    .name = "emscripten",
    .desc = "Emscripten plugin",
    .license = "LGPL3",
  },
  .uris = "emscripten://",
  .check = on_check,
  .open = on_open,
  .close = on_close,
  .read = on_read,
  .write = on_write,
  .seek = on_seek,
  .resize = on_resize,
};

static RCore * r;

int
main (void)
{
  return 0;
}

void
r2_open (const char * os,
         const char * arch,
         int bits)
{
  r = r_core_new ();

  r_io_plugin_add (r->io, &r_io_plugin_emscripten);

  RConfig * config = r->config;
  r_config_set_b (config, "scr.html", true);
  r_config_set_b (config, "scr.utf8", true);
  r_config_set_i (config, "scr.color", COLOR_MODE_16M);
  r_config_set (config, "cfg.json.num", "hex");
  r_config_set_b (config, "asm.emu", true);
  r_config_set_b (config, "emu.str", true);
  r_config_set (config, "anal.cc", "cdecl");

  r_config_set (config, "asm.os", os);
  r_config_set (config, "asm.arch", arch);
  r_config_set_i (config, "asm.bits", bits);

  r_core_task_sync_begin (&r->tasks);

  const char * uri = "emscripten:///";
  const ut64 load_address = 0;
  RIODesc * desc = r_core_file_open (r, uri, R_PERM_RWX, load_address);
  int res = r_core_cmd0 (r, "=!");
  bool success = r_core_bin_load (r, uri, load_address);
}

char *
r2_execute (const char * command)
{
  return r_core_cmd_str (r, command);
}

static bool
on_check (RIO * io,
          const char * pathname,
          bool many)
{
  return r_str_startswith (pathname, "emscripten://");
}

static RIODesc *
on_open (RIO * io,
         const char * pathname,
         int rw,
         int mode)
{
  RIOEmscripten * ems = R_NEW0 (RIOEmscripten);
  if (ems == NULL)
    return NULL;

  return r_io_desc_new (io, &r_io_plugin_emscripten, pathname, R_PERM_RWX, mode, ems);
}

static bool
on_close (RIODesc * fd)
{
  R_FREE (fd->data);

  return true;
}

EM_ASYNC_JS (
    int,
    on_read, (RIO * io,
              RIODesc * fd,
              ut8 * buf,
              int count),
    {
      try {
        const bytes = await Module.onRead(Module.offset, count);
        const n = bytes.byteLength;
        HEAPU8.subarray(buf, buf + n).set(new Uint8Array(bytes));
        return n;
      } catch (e) {
        return -1;
      }
  }
);

static int
on_write (RIO * io,
          RIODesc * fd,
          const ut8 * buf,
          int count)
{
  return -1;
}

EM_JS (
    int,
    update_offset, (const char * offset),
    {
      Module.offset = UTF8ToString(offset);
      return 0;
    }
);

static ut64
on_seek (RIO * io,
         RIODesc * fd,
         ut64 offset,
         int whence)
{
  switch (whence)
  {
    case SEEK_SET:
      io->off = offset;
      break;
    case SEEK_CUR:
      io->off += (int)offset;
      break;
    case SEEK_END:
      io->off = UT64_MAX;
      break;
  }

  r_strf_var (off_str, 64, "0x%" PFMT64x, io->off);
  update_offset (off_str);

  return io->off;
}

static bool
on_resize (RIO * io,
           RIODesc * fd,
           ut64 count)
{
  return false;
}
