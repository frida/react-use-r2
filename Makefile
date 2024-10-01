R2_COMMIT ?= 5545df71eeead5aa035a389acd10ee2fdac3d5bc

dist/lib/index.js: package.json lib/index.ts dist/r2.mjs
	npm install
	npm run build

dist/r2.mjs: src/r2.c ext/radare2/libr/libr.a
	mkdir -p $(@D)
	emcc \
		$< \
		-Oz \
		-Iext/radare2/libr/include -Iext/radare2/shlr/sdb/include \
		-Lext/radare2/libr -lr \
		-o dist/r2.mjs \
		--emit-tsd=r2.d.ts \
		-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString \
		-sEXPORTED_FUNCTIONS=_main,_r2_open,_r2_execute,_free \
		-sASYNCIFY \
		-sASYNCIFY_STACK_SIZE=16384
	sed -e "s,(Arguments | any\[\]),any[],g" dist/r2.d.ts > dist/r2.d.ts.new
	mv dist/r2.d.ts.new dist/r2.d.ts
	cp dist/r2.mjs dist/r2.d.ts lib/

ext/radare2/libr/libr.a: ext/radare2/.stamp
	cd ext/radare2 && ./sys/wasm.sh

ext/radare2/.stamp:
	rm -rf ext/radare2
	git clone https://github.com/radareorg/radare2.git ext/radare2
	cd ext/radare2 \
		&& git checkout $(R2_COMMIT) \
		&& patch -p1 < ../../ext/patches/r2-config-tweaks.patch
	touch $@
