
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Schedules a callback to run immediately before the component is unmounted.
     *
     * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
     * only one that runs inside a server-side component.
     *
     * https://svelte.dev/docs#run-time-svelte-ondestroy
     */
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    var empresaData = {
      tipos: [
        {
          tipo: "Persona Física",
          descripcion:
            "Una empresa de tipo persona física es una forma de organización empresarial en la que un individuo, conocido como persona física o trabajador independiente, realiza actividades económicas con fines de lucro sin constituirse formalmente como una sociedad o compañía. En este tipo de empresa, el propietario es la misma persona que opera el negocio, y no existe una entidad separada entre el empresario y la empresa. La persona física es responsable ilimitadamente con sus bienes personales por las obligaciones contraídas en el ejercicio de su actividad económica.",
          pasos: [
            {
              paso: "Definir actividad comercial",
              descripcion: "Determine la actividad que la empresa desarrollará.",
              documentos: [
                "Definición de actividades comerciales",
                "Plan de negocio (recomendado)",
              ],
              subpasos: [
                {
                  subpaso: "Identifique el producto o servicio que ofrecerá.",
                  detalle: [
                    "Investigue las necesidades del mercado local: consulte con expertos de la industria, lea reportes y participe en foros especializados para entender qué necesidades existen en su área de interés.",
                    "Contacte a posibles clientes para comprender sus necesidades y asegúrese de tener preparada una lista de preguntas claras: haga preguntas específicas como '¿Qué problemas enfrenta actualmente que este producto podría resolver?' y anote las respuestas para ajustar su propuesta de valor.",
                    "Prepare una descripción detallada del producto o servicio, destacando sus beneficios: utilice un lenguaje sencillo y enfocado en los beneficios clave, como el ahorro de tiempo o el aumento de eficiencia.",
                  ],
                  caveats: [
                    "Asegúrese de que la actividad comercial no esté limitada por ninguna disposición legal y cumpla con las normativas locales.",
                  ],
                },
                {
                  subpaso: "Realice un estudio de mercado para evaluar la demanda.",
                  detalle: [
                    "Contrate un analista de mercado o contacte con la cámara de comercio local para recibir asesoría: asegúrese de explicar claramente el tipo de información que necesita sobre su mercado objetivo.",
                    "Prepare una encuesta con preguntas clave sobre el interés de los consumidores en el producto o servicio: haga preguntas cerradas y abiertas para recopilar una amplia variedad de opiniones.",
                    "Presente los resultados de la encuesta en forma de gráficos para comprender mejor las tendencias: utilice herramientas como Excel o Google Sheets para crear gráficos visuales que resuman los resultados y facilite su interpretación.",
                  ],
                },
                {
                  subpaso: "Defina cómo se diferenciará de la competencia.",
                  detalle: [
                    "Haga una lista de competidores directos e indirectos y estudie sus ofertas: analice los puntos débiles y fuertes de cada competidor, visitando sus sitios web o tiendas físicas y recopilando datos relevantes.",
                    "Prepare una tabla comparativa destacando áreas donde su empresa puede mejorar lo que ofrece la competencia: incluya características como precio, calidad, servicio al cliente y tiempo de entrega.",
                    "Conéctese con clientes potenciales para conocer sus experiencias previas con la competencia y qué mejoras desean ver: ofrezca incentivos como descuentos o muestras gratuitas para motivar a los clientes a compartir sus opiniones honestas.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción Tributaria",
              descripcion:
                "Registre su empresa como contribuyente ante el Ministerio de Hacienda usando el formulario D-140.",
              documentos: [
                "Formulario D-140",
                "Documento de identificación (cédula)",
              ],
              subpasos: [
                {
                  subpaso:
                    "Complete el formulario D-140 con sus datos personales y los de la empresa.",
                  detalle: [
                    "Visite la página oficial del Ministerio de Hacienda para descargar el formulario: asegúrese de ingresar al sitio correcto verificando el URL.",
                    "Prepare la información básica como nombre completo, número de cédula, dirección y detalles de la actividad comercial: tenga a mano su cédula y cualquier otra identificación pertinente para facilitar el proceso.",
                    "Revise cuidadosamente los campos requeridos antes de enviar el formulario para evitar errores: compare los datos ingresados con sus documentos oficiales para asegurar la exactitud.",
                  ],
                  caveats: [
                    "Es fundamental realizar la inscripción en el Registro Mercantil antes de la inscripción tributaria, ya que este es un requisito previo para operar legalmente.",
                  ],
                },
                {
                  subpaso:
                    "Presente el formulario en la oficina del Ministerio de Hacienda más cercana.",
                  detalle: [
                    "Localice la oficina más cercana y verifique su horario de atención (generalmente de lunes a viernes de 8:00 am a 4:00 pm): utilice Google Maps para encontrar la ubicación y planifique su visita con anticipación.",
                    "Lleve consigo el formulario completo y una copia de su documento de identificación: organice los documentos en una carpeta para facilitar su acceso al momento de entregarlos.",
                    "Al llegar, indique que desea registrar su empresa como contribuyente y entregue la documentación al funcionario: sea claro y conciso al explicar su solicitud para evitar confusiones.",
                  ],
                },
                {
                  subpaso: "Obtenga el comprobante de inscripción.",
                  detalle: [
                    "Solicite el comprobante al funcionario luego de la revisión del formulario: pregunte si hay alguna recomendación adicional para futuras gestiones.",
                    "Guarde el comprobante en un lugar seguro, ya que es un documento importante para futuras gestiones tributarias: utilice una carpeta específica para documentos de la empresa.",
                    "Escanee el comprobante y guárdelo en formato digital para tener un respaldo: use una aplicación de escaneo en su teléfono móvil para crear una copia digital rápidamente.",
                  ],
                },
              ],
            },
            {
              paso: "Obtención de Permisos y Licencias",
              descripcion:
                "Solicite el Permiso Sanitario de Funcionamiento al Ministerio de Salud si aplica, y la patente municipal en la municipalidad correspondiente.",
              documentos: [
                "Permiso Sanitario del Ministerio de Salud",
                "Patente Municipal",
              ],
              subpasos: [
                {
                  subpaso:
                    "Llene el formulario de solicitud del Permiso Sanitario en el sitio web del Ministerio de Salud.",
                  detalle: [
                    "Visite la página oficial del Ministerio de Salud y busque la sección de permisos: use la barra de búsqueda para agilizar la navegación en el sitio web.",
                    "Complete la información requerida, incluyendo la descripción detallada de las instalaciones de la empresa: asegúrese de incluir detalles sobre la infraestructura, medidas de seguridad y protocolos sanitarios.",
                    "Prepare la información sobre el uso del inmueble y adjude el contrato de arrendamiento si corresponde: tenga una copia digital del contrato lista para ser subida al formulario.",
                  ],
                  caveats: [
                    "El uso del inmueble debe estar acorde con las regulaciones municipales y cumplir con las normativas de salud y seguridad requeridas para la actividad comercial.",
                  ],
                },
                {
                  subpaso:
                    "Adjunte los documentos requeridos, incluyendo el plan de negocio.",
                  detalle: [
                    "Prepare una copia del plan de negocio y cualquier otro documento requerido, como planos del local: verifique que los documentos estén actualizados y completos.",
                    "Verifique que todos los archivos estén en formato PDF y que la calidad de la imagen sea clara: use un escáner de buena calidad para asegurar que los documentos sean legibles.",
                    "Suba los archivos al formulario online y espere la confirmación de recepción: revise que todos los archivos se hayan cargado correctamente antes de enviar la solicitud.",
                  ],
                },
                {
                  subpaso: "Presente la solicitud y espere la aprobación.",
                  detalle: [
                    "Una vez completado el formulario, haga clic en enviar y tome nota del número de solicitud: guarde este número para poder hacer seguimiento en caso de retrasos.",
                    "Espere una respuesta por correo electrónico o consulte el estado en el sitio web del Ministerio de Salud: marque el correo del Ministerio como seguro para no perder la notificación.",
                    "Si se requiere algún documento adicional, prepárelo y entréguelo a la brevedad para evitar retrasos: contacte al funcionario asignado si tiene alguna duda sobre los requerimientos adicionales.",
                  ],
                },
                {
                  subpaso:
                    "Diríjase a la municipalidad correspondiente para solicitar la patente municipal.",
                  detalle: [
                    "Localice la municipalidad correspondiente y verifique el horario de atención: llame previamente para confirmar la documentación y asegurarse de que la oficina esté abierta.",
                    "Lleve consigo los documentos necesarios, incluidos el Permiso Sanitario aprobado y el formulario de solicitud de patente: ordene los documentos de acuerdo con los requisitos para facilitar el proceso.",
                    "Explique al funcionario que desea solicitar la patente para operar un negocio y entregue la documentación: sea paciente y proporcione cualquier información adicional que se le solicite.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Empresa Activa",
              descripcion:
                "Realice las gestiones necesarias para mantener la empresa activa y en cumplimiento de sus obligaciones legales y fiscales.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos de la Caja Costarricense de Seguro Social (CCSS)",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos: asegúrese de utilizar su número de cédula y contraseña para ingresar.",
                    "Complete la declaración con los ingresos y gastos del mes: asegúrese de tener todos los recibos y facturas organizados para facilitar este proceso.",
                    "Pague el impuesto correspondiente antes de la fecha límite (generalmente el último día del mes): puede realizar el pago a través de transferencia bancaria o en cualquier banco autorizado.",
                  ],
                },
                {
                  subpaso: "Pago de la Caja Costarricense de Seguro Social (CCSS)",
                  detalle: [
                    "Calcule las cargas sociales que debe pagar cada mes en base a los salarios pagados: este cálculo puede hacerlo a través del sistema en línea de la CCSS.",
                    "Visite el portal de la CCSS o un banco autorizado para realizar el pago de las cargas sociales: el pago debe hacerse antes del día 15 de cada mes.",
                    "Guarde el comprobante de pago como respaldo para futuras auditorías o revisiones.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento del Permiso Sanitario y la patente municipal: estos permisos generalmente se deben renovar anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para presentar los documentos requeridos para la renovación: incluya una copia del permiso anterior y un comprobante de pago de impuestos municipales.",
                    "Pague las tarifas correspondientes y espere la aprobación de la renovación: asegúrese de guardar los comprobantes de pago y las nuevas licencias.",
                  ],
                  caveats: [
                    "Si no se renuevan los permisos a tiempo, la empresa podría enfrentar sanciones o incluso el cierre temporal.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad Anónima",
          descripcion:
            "Una empresa de tipo Sociedad Anónima (S.A.) es una forma de organización empresarial que constituye una entidad legal separada de sus propietarios, conocida como una persona jurídica. En una Sociedad Anónima, la propiedad de la empresa se divide en acciones, que pueden ser compradas, vendidas o transferidas libremente entre los accionistas. Esta estructura proporciona una limitación de responsabilidad, de modo que los accionistas solo son responsables hasta el monto de su inversión (Artículo 75 del Código de Comercio).",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Visite el sitio web del Registro Nacional.",
                  detalle: [
                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra empresa: intente varias alternativas por si el nombre deseado ya está tomado.",
                  ],
                  caveats: [
                    "El nombre debe ser único y no prestarse a confusión con otras sociedades existentes. Asegúrese de cumplir con las normas establecidas para la denominación de sociedades en el Registro Nacional (Artículo 246 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Realice una consulta de disponibilidad de nombre.",
                  detalle: [
                    "Ingrese el nombre propuesto para la empresa en la barra de búsqueda: asegúrese de escribirlo correctamente para evitar errores en la búsqueda.",
                    "Espere los resultados de la consulta y revise posibles coincidencias: tome nota de cualquier nombre similar que pueda generar confusión.",
                    "Si el nombre está disponible, continúe con el proceso de registro: tome una captura de pantalla del resultado como respaldo.",
                  ],
                },
                {
                  subpaso: "Solicite la certificación para reservar el nombre.",
                  detalle: [
                    "Complete el formulario de solicitud para reservar el nombre: asegúrese de ingresar toda la información correctamente.",
                    "Presente el formulario en la oficina del Registro Nacional o envíelo electrónicamente: si lo hace en persona, verifique el horario de atención.",
                    "Pague la tarifa correspondiente para garantizar la reserva del nombre: guarde el recibo de pago como comprobante.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar Acta Constitutiva",
              descripcion:
                "Redacte el acta constitutiva con la asistencia de un abogado, que incluya información sobre los accionistas, capital social y administración.",
              documentos: [
                "Acta Constitutiva",
                "Identificación de los accionistas",
              ],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción del acta constitutiva.",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Contacte al abogado y programe una reunión para discutir los detalles de la sociedad: prepare una lista de preguntas sobre el proceso y costos involucrados.",
                    "Asegúrese de llevar información de los accionistas, incluyendo nombres completos y copias de identificación: confirme que cada accionista tenga sus documentos en regla.",
                  ],
                  caveats: [
                    "Es obligatorio que el acta constitutiva esté autenticada por un notario público para que tenga validez legal (Artículo 102 del Código de Comercio).",
                  ],
                },
                {
                  subpaso:
                    "Incluya información detallada sobre los accionistas y el capital inicial.",
                  detalle: [
                    "Especifique la cantidad de acciones y la participación de cada socio: defina claramente cómo se dividirán las ganancias y responsabilidades.",
                    "Defina el monto del capital social y cómo será distribuido: asegúrese de que todos los accionistas estén de acuerdo con la distribución propuesta.",
                    "Incluya la información de contacto de cada socio y sus responsabilidades: verifique que cada socio entienda sus responsabilidades y esté dispuesto a cumplirlas.",
                  ],
                  caveats: [
                    "Asegúrese de que el capital social mínimo cumpla con los requisitos legales establecidos para sociedades anónimas (Artículo 5 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Firme el documento ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar el acta: confirme la disponibilidad de todos los socios antes de fijar la fecha.",
                    "Asegúrese de que todos los socios estén presentes y lleven identificación: revise los requisitos del notario para asegurarse de cumplirlos.",
                    "El notario autenticará las firmas y dará fe de la validez del documento: solicite una copia certificada del documento para cada socio.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la sociedad anónima en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Acta Constitutiva autenticada",
                "Certificación de disponibilidad de nombre",
                "Identificación de los accionistas",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para obtener el formulario de inscripción.",
                    "Complete toda la información requerida sobre los accionistas y la empresa: asegúrese de que los datos sean precisos.",
                    "Adjunte todos los documentos necesarios, incluyendo el acta constitutiva autenticada y la certificación de nombre.",
                  ],
                  caveats: [
                    "Todos los documentos presentados deben ser originales o copias autenticadas para evitar demoras en el proceso de inscripción (Artículo 235 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Presente todos los documentos en la oficina del Registro Nacional: verifique el horario de atención para evitar inconvenientes.",
                    "Pague las tarifas correspondientes al registro de la sociedad: conserve el recibo de pago como comprobante.",
                    "Espere la revisión de la documentación por parte del Registro Nacional: ellos le indicarán si hay algún problema o si se requiere algún documento adicional.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica.",
                  detalle: [
                    "Una vez aprobado el registro, solicite una copia de la personería jurídica: este documento es necesario para realizar otras gestiones a nombre de la empresa.",
                    "Guarde la personería jurídica en un lugar seguro: también puede optar por tener una copia digital.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y llevar a cabo otras gestiones legales en nombre de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Constitución de la Sociedad Anónima",
              descripcion:
                "Formalice la creación de la sociedad anónima mediante escritura pública ante un notario y registre los estatutos en el Registro Nacional.",
              documentos: [
                "Escritura de constitución de la sociedad",
                "Estatutos de la sociedad",
                "Lista de accionistas",
              ],
              subpasos: [
                {
                  subpaso: "Redacción de los Estatutos",
                  detalle: [
                    "Contrate a un abogado para redactar los estatutos de la sociedad, que incluyan el nombre, objeto social, capital social, y estructura de la administración.",
                    "Reúnase con los socios para acordar los términos de los estatutos y asegurarse de que todos estén de acuerdo con las condiciones establecidas.",
                    "Una vez aprobados, firme los estatutos ante un notario público para darles validez legal.",
                  ],
                  caveats: [
                    "Los estatutos deben cumplir con todas las disposiciones legales y ser inscritos correctamente en el Registro Nacional para evitar problemas legales futuros (Artículo 107 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Registro en el Registro Nacional",
                  detalle: [
                    "Visite el Registro Nacional o utilice su portal en línea para presentar la escritura de constitución y los estatutos.",
                    "Complete el formulario de inscripción y pague las tasas correspondientes al registro de la sociedad.",
                    "Espere la confirmación del Registro Nacional y guarde el documento de personería jurídica.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción Tributaria",
              descripcion:
                "Registre la sociedad como contribuyente ante el Ministerio de Hacienda y obtenga el Número de Identificación Tributaria (NIT).",
              documentos: [
                "Formulario D-140",
                "Documento de identidad del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Registro en el Ministerio de Hacienda",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda y complete el formulario D-140 con los datos de la sociedad.",
                    "Adjunte los documentos requeridos, como la cédula del representante legal y la escritura de constitución.",
                    "Espere la confirmación del registro y obtenga el NIT, que se usará para todos los trámites tributarios.",
                  ],
                  caveats: [
                    "El NIT es obligatorio para cualquier actividad comercial de la sociedad y debe ser obtenido antes de iniciar operaciones.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abra una cuenta bancaria a nombre de la sociedad para manejar sus operaciones financieras.",
              documentos: [
                "Escritura de constitución",
                "Personería jurídica",
                "Cédula del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Contactar al Banco",
                  detalle: [
                    "Seleccione un banco que ofrezca condiciones adecuadas para la cuenta empresarial y comuníquese con un asesor.",
                    "Solicite una cita para la apertura de la cuenta: explique que se trata de una sociedad anónima recién constituida y que necesita una cuenta para sus operaciones.",
                    "Prepare los documentos requeridos y preséntese el día de la cita en la sucursal bancaria seleccionada.",
                  ],
                  caveats: [
                    "Cada banco tiene sus propios requisitos para la apertura de cuentas corporativas. Consulte previamente para asegurarse de cumplir con todos los requisitos.",
                  ],
                },
                {
                  subpaso: "Apertura de la Cuenta",
                  detalle: [
                    "Complete los formularios del banco para la apertura de la cuenta: asegúrese de proporcionar toda la información de la sociedad, incluyendo el NIT y la personería jurídica.",
                    "Deposite el monto mínimo requerido para abrir la cuenta, si aplica: este monto puede variar según el banco.",
                    "Guarde todos los comprobantes relacionados con la apertura de la cuenta, ya que serán necesarios para futuras transacciones.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Sociedad Activa",
              descripcion:
                "Cumpla con las obligaciones fiscales y administrativas para mantener la sociedad en regla.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos de la CCSS",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos mensuales: use el NIT para ingresar.",
                    "Complete la declaración con los ingresos y gastos de la sociedad: tenga a mano los libros contables y facturas.",
                    "Pague el impuesto antes de la fecha límite para evitar multas: puede realizar el pago en línea o en un banco autorizado.",
                  ],
                  caveats: [
                    "El incumplimiento de las obligaciones fiscales puede resultar en sanciones y multas, así como la suspensión del NIT.",
                  ],
                },
                {
                  subpaso: "Pago de la CCSS",
                  detalle: [
                    "Calcule las cargas sociales mensuales en base a los salarios de los empleados: este cálculo puede hacerse a través del sistema en línea de la CCSS.",
                    "Realice el pago de las cargas sociales antes del día 15 de cada mes: puede hacer el pago en línea o en un banco autorizado.",
                    "Guarde el comprobante del pago como respaldo para auditorías.",
                  ],
                  caveats: [
                    "El no pago de las cargas sociales puede generar multas y restricciones para operar legalmente.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y patentes de la sociedad: generalmente se renuevan anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para renovar los permisos: presente el comprobante de pago de impuestos y otros documentos requeridos.",
                    "Pague las tarifas correspondientes y guarde los comprobantes.",
                  ],
                  caveats: [
                    "El no renovar los permisos y licencias a tiempo puede llevar a la suspensión de la actividad comercial de la sociedad.",
                  ],
                },
                {
                  subpaso: "Reportes Financieros Anuales",
                  detalle: [
                    "Contrate a un contador para preparar los estados financieros anuales de la sociedad.",
                    "Presente el reporte anual de ingresos y gastos al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o con ayuda del contador.",
                    "Asegúrese de cumplir con todas las normativas contables y fiscales para evitar sanciones.",
                  ],
                  caveats: [
                    "Los reportes financieros deben cumplir con las Normas Internacionales de Información Financiera (NIIF) para evitar problemas legales y garantizar la transparencia.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad de Responsabilidad Limitada (S.R.L.)",
          descripcion:
            "Una empresa de tipo Sociedad de Responsabilidad Limitada (S.R.L.) es una forma de organización empresarial que combina características de las sociedades de personas y las sociedades de capital, proporcionando a los socios la ventaja de responsabilidad limitada y una gestión más simplificada en comparación con una Sociedad Anónima (S.A.). Es una opción común para pequeñas y medianas empresas (PYMES) que desean limitar la responsabilidad de los socios sin las complejidades de una gran corporación.",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Visite el sitio web del Registro Nacional.",
                  detalle: [
                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra empresa: intente varias alternativas por si el nombre deseado ya está tomado.",
                  ],
                  caveats: [
                    "El nombre de la empresa no debe ser igual o similar a uno ya registrado, para evitar problemas legales o de confusión en el mercado. El nombre debe estar constituido por letras y puede abreviarse 'Ltda' o 'S.R.L.' según los estatutos sociales (Artículo 39 del Código de Comercio)&#8203;:contentReference[oaicite:0]{index=0}.",
                  ],
                },
                {
                  subpaso: "Realice una consulta de disponibilidad de nombre.",
                  detalle: [
                    "Ingrese el nombre propuesto para la empresa en la barra de búsqueda: asegúrese de escribirlo correctamente para evitar errores en la búsqueda.",
                    "Espere los resultados de la consulta y revise posibles coincidencias: tome nota de cualquier nombre similar que pueda generar confusión.",
                    "Si el nombre está disponible, continúe con el proceso de registro: tome una captura de pantalla del resultado como respaldo.",
                  ],
                },
                {
                  subpaso: "Solicite la certificación para reservar el nombre.",
                  detalle: [
                    "Complete el formulario de solicitud para reservar el nombre: asegúrese de ingresar toda la información correctamente.",
                    "Presente el formulario en la oficina del Registro Nacional o envíelo electrónicamente: si lo hace en persona, verifique el horario de atención.",
                    "Pague la tarifa correspondiente para garantizar la reserva del nombre: guarde el recibo de pago como comprobante.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar el Pacto Social",
              descripcion:
                "Redacte el pacto social de la S.R.L. con la asistencia de un abogado, incluyendo información sobre los socios, el capital social y la administración.",
              documentos: ["Pacto Social", "Identificación de los socios"],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción del pacto social.",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Contacte al abogado y programe una reunión para discutir los detalles de la sociedad: prepare una lista de preguntas sobre el proceso y costos involucrados.",
                    "Asegúrese de llevar información de los socios, incluyendo nombres completos y copias de identificación: confirme que cada socio tenga sus documentos en regla.",
                  ],
                  caveats: [
                    "Es obligatorio que el pacto social sea redactado por un abogado especializado en derecho corporativo para garantizar el cumplimiento de la legislación vigente.",
                  ],
                },
                {
                  subpaso:
                    "Incluya información detallada sobre los socios y el capital inicial.",
                  detalle: [
                    "Especifique la participación de cada socio: defina claramente cómo se dividirán las ganancias y responsabilidades.",
                    "Defina el monto del capital social y cómo será distribuido: asegúrese de que todos los socios estén de acuerdo con la distribución propuesta. El capital está dividido en cuotas nominativas no transferibles sin la aprobación de la Asamblea de Cuotistas (Artículo 39 del Código de Comercio)&#8203;:contentReference[oaicite:1]{index=1}.",
                    "Incluya la información de contacto de cada socio y sus responsabilidades: verifique que cada socio entienda sus responsabilidades y esté dispuesto a cumplirlas.",
                  ],
                  caveats: [
                    "El capital social debe ser suficiente para cubrir las responsabilidades iniciales de la sociedad, y todos los socios deben estar de acuerdo con la distribución.",
                  ],
                },
                {
                  subpaso: "Firme el documento ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar el pacto social: confirme la disponibilidad de todos los socios antes de fijar la fecha.",
                    "Asegúrese de que todos los socios estén presentes y lleven identificación: revise los requisitos del notario para asegurarse de cumplirlos.",
                    "El notario autenticará las firmas y dará fe de la validez del documento: solicite una copia certificada del documento para cada socio.",
                  ],
                  caveats: [
                    "La firma ante notario es esencial para darle validez legal al pacto social y garantizar que todos los socios estén debidamente representados.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la S.R.L. en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Pacto Social autenticado",
                "Certificación de disponibilidad de nombre",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para obtener el formulario de inscripción.",
                    "Complete toda la información requerida sobre los socios y la empresa: asegúrese de que los datos sean precisos.",
                    "Adjunte todos los documentos necesarios, incluyendo el pacto social autenticado y la certificación de nombre.",
                  ],
                  caveats: [
                    "Es imprescindible adjuntar todos los documentos requeridos para evitar demoras en el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Presente todos los documentos en la oficina del Registro Nacional: verifique el horario de atención para evitar inconvenientes.",
                    "Pague las tarifas correspondientes al registro de la sociedad: conserve el recibo de pago como comprobante.",
                    "Espere la revisión de la documentación por parte del Registro Nacional: ellos le indicarán si hay algún problema o si se requiere algún documento adicional.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se paguen todas las tarifas correspondientes y se presente toda la documentación requerida.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica.",
                  detalle: [
                    "Una vez aprobado el registro, solicite una copia de la personería jurídica: este documento es necesario para realizar otras gestiones a nombre de la empresa.",
                    "Guarde la personería jurídica en un lugar seguro: también puede optar por tener una copia digital.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y llevar a cabo otras gestiones legales en nombre de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Empresa Activa",
              descripcion:
                "Realice las gestiones necesarias para mantener la sociedad de responsabilidad limitada en regla y en cumplimiento de sus obligaciones legales y fiscales.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos de la Caja Costarricense de Seguro Social (CCSS)",
                "Actas de asambleas ordinarias y extraordinarias",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos: asegúrese de utilizar el Número de Identificación Tributaria (NIT) para ingresar.",
                    "Complete la declaración con los ingresos y gastos del mes: asegúrese de tener todos los recibos y facturas organizados para facilitar este proceso.",
                    "Pague el impuesto correspondiente antes de la fecha límite (generalmente el último día del mes): puede realizar el pago a través de transferencia bancaria o en cualquier banco autorizado.",
                  ],
                },
                {
                  subpaso: "Pago de la Caja Costarricense de Seguro Social (CCSS)",
                  detalle: [
                    "Calcule las cargas sociales que debe pagar cada mes en base a los salarios pagados a los empleados: este cálculo puede hacerlo a través del sistema en línea de la CCSS.",
                    "Visite el portal de la CCSS o un banco autorizado para realizar el pago de las cargas sociales: el pago debe hacerse antes del día 15 de cada mes.",
                    "Guarde el comprobante de pago como respaldo para futuras auditorías o revisiones.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y licencias: estos permisos generalmente se deben renovar anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para presentar los documentos requeridos para la renovación: incluya una copia del permiso anterior y un comprobante de pago de impuestos municipales.",
                    "Pague las tarifas correspondientes y espere la aprobación de la renovación: asegúrese de guardar los comprobantes de pago y las nuevas licencias.",
                  ],
                },
                {
                  subpaso: "Asambleas Ordinarias y Extraordinarias",
                  detalle: [
                    "Programe una asamblea ordinaria al menos una vez al año para discutir el estado de la empresa y tomar decisiones importantes: asegúrese de notificar a todos los socios con antelación.",
                    "Levante un acta de la asamblea y haga que todos los socios la firmen: este documento es necesario para registrar cualquier decisión oficial tomada durante la reunión.",
                    "Si se requiere una asamblea extraordinaria para decisiones urgentes, notifique a los socios y registre las decisiones en un acta: mantenga estos registros en un lugar seguro.",
                  ],
                },
                {
                  subpaso: "Contabilidad y Reportes Anuales",
                  detalle: [
                    "Contrate a un contador para llevar los libros contables de la empresa: los libros deben estar actualizados y cumplir con las normativas del Ministerio de Hacienda.",
                    "Prepare el reporte anual de ingresos y gastos: asegúrese de incluir todas las facturas y recibos de cada transacción durante el año.",
                    "Presente el reporte anual al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o directamente con la ayuda del contador.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Cooperativa",
          descripcion:
            "Una empresa de tipo Cooperativa es una organización empresarial que se distingue de otras formas de negocio por estar basada en principios de solidaridad, participación democrática y beneficio colectivo. Una cooperativa se constituye como una persona jurídica que pertenece y es gestionada por sus miembros, quienes son, al mismo tiempo, sus propietarios y principales beneficiarios. Su objetivo principal es satisfacer las necesidades y aspiraciones comunes de sus miembros, más que maximizar las ganancias como en las empresas tradicionales. Además, debe operar dentro de los límites establecidos por el Código de Comercio y otras leyes específicas para entidades no lucrativas.",
          pasos: [
            {
              paso: "Definir el Objeto de la Cooperativa",
              descripcion:
                "Determine la misión, visión y el objeto de la cooperativa, asegurándose de que esté alineado con los principios cooperativos y que se enmarque dentro de las actividades lícitas permitidas por la ley.",
              documentos: [
                "Misión y visión de la cooperativa",
                "Estatutos de la cooperativa",
              ],
              subpasos: [
                {
                  subpaso: "Reúnase con los miembros fundadores.",
                  detalle: [
                    "Coordine una reunión con todas las personas interesadas en formar la cooperativa: asegúrese de que cada miembro esté comprometido con el propósito colectivo.",
                    "Defina la misión y visión: asegúrese de que estén alineadas con los principios cooperativos y que reflejen los intereses de los miembros.",
                    "Documente la misión, visión y objetivos: esto servirá de base para la redacción de los estatutos de la cooperativa.",
                  ],
                  caveats: [
                    "La misión y visión deben alinearse con los principios cooperativos para asegurar la coherencia y el compromiso de todos los miembros. Además, deben cumplir con la normativa del Código de Comercio para evitar problemas legales.",
                  ],
                },
                {
                  subpaso: "Redacte los estatutos de la cooperativa.",
                  detalle: [
                    "Contrate un abogado especializado en cooperativas para redactar los estatutos: asegúrese de incluir los derechos y responsabilidades de los miembros.",
                    "Incluya información sobre el proceso de toma de decisiones y estructura de la cooperativa: asegúrese de que todos los miembros entiendan y aprueben estos estatutos.",
                    "Revise y finalice los estatutos con el abogado y los miembros fundadores: todos deben estar de acuerdo con los términos antes de proceder.",
                  ],
                  caveats: [
                    "Es importante que los estatutos reflejen claramente los derechos y responsabilidades de los miembros para evitar futuros conflictos. Además, deben cumplir con los requisitos establecidos en el Código de Comercio para su validez legal.",
                  ],
                },
              ],
            },
            {
              paso: "Constitución de la Cooperativa",
              descripcion:
                "Formalice la constitución de la cooperativa mediante una asamblea constitutiva y la firma de los estatutos, asegurándose de cumplir con los requisitos del Código de Comercio.",
              documentos: [
                "Estatutos de la cooperativa",
                "Lista de miembros fundadores",
              ],
              subpasos: [
                {
                  subpaso: "Organice la asamblea constitutiva.",
                  detalle: [
                    "Prepare una convocatoria para todos los miembros fundadores: asegúrese de que todos estén informados sobre la fecha, hora y lugar de la reunión.",
                    "Elabore la agenda de la asamblea: incluya puntos clave como la aprobación de los estatutos y la elección de la junta directiva.",
                    "Asegúrese de contar con quórum para tomar decisiones: verifique cuántos miembros son necesarios para cumplir con los requisitos legales.",
                  ],
                  caveats: [
                    "Es esencial contar con quórum en la asamblea constitutiva para que las decisiones tomadas tengan validez legal, tal como lo exige el Código de Comercio.",
                  ],
                },
                {
                  subpaso: "Aprobación de los estatutos y firma de los documentos.",
                  detalle: [
                    "Presente los estatutos a todos los miembros para su aprobación: asegúrese de responder a todas las preguntas y aclarar cualquier duda.",
                    "Todos los miembros fundadores deben firmar los estatutos: coordine con un notario para que autentique las firmas y asegure la validez del documento.",
                    "El notario debe emitir una copia certificada del acta de la asamblea: guarde este documento como evidencia de la constitución de la cooperativa.",
                  ],
                  caveats: [
                    "La firma ante notario es necesaria para garantizar la validez legal de los estatutos y la constitución de la cooperativa, conforme a lo estipulado en el Código de Comercio.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la cooperativa en el Registro Nacional para formalizar su existencia legal y obtener su personería jurídica.",
              documentos: [
                "Estatutos autenticados",
                "Acta de la asamblea constitutiva",
                "Lista de miembros fundadores",
              ],
              subpasos: [
                {
                  subpaso: "Prepare los documentos requeridos para el registro.",
                  detalle: [
                    "Reúna los estatutos autenticados, el acta de la asamblea y la lista de miembros fundadores.",
                    "Asegúrese de que todos los documentos estén en regla y cumplan con los requisitos legales: consulte con el notario si tiene alguna duda.",
                    "Realice copias adicionales de todos los documentos: algunas oficinas del Registro Nacional pueden solicitar copias adicionales.",
                  ],
                  caveats: [
                    "Es importante asegurarse de que todos los documentos estén en regla para evitar retrasos en el proceso de inscripción, según lo estipulado en el Reglamento del Registro de Transparencia y Beneficiarios Finales.",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para conocer los requisitos específicos para cooperativas.",
                    "Complete el formulario de inscripción y adjunte los documentos necesarios: asegúrese de llenar correctamente todos los campos.",
                    "Pague las tarifas correspondientes al registro de la cooperativa: guarde el recibo de pago como comprobante.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se presenten todos los documentos requeridos y se paguen las tarifas correspondientes.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica de la cooperativa.",
                  detalle: [
                    "Una vez aprobado el registro, solicite una copia de la personería jurídica: este documento es necesario para realizar otras gestiones a nombre de la cooperativa.",
                    "Guarde la personería jurídica en un lugar seguro: también puede optar por tener una copia digital.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y realizar otros trámites legales a nombre de la cooperativa.",
                  ],
                },
              ],
            },
            {
              paso: "Afiliación al INFOCOOP",
              descripcion:
                "Afíliese al Instituto Nacional de Fomento Cooperativo (INFOCOOP) para recibir apoyo y asesoría técnica y financiera.",
              documentos: ["Personería jurídica", "Formulario de afiliación"],
              subpasos: [
                {
                  subpaso: "Prepare la documentación para la afiliación.",
                  detalle: [
                    "Complete el formulario de afiliación proporcionado por INFOCOOP: asegúrese de llenar toda la información solicitada.",
                    "Adjunte una copia de la personería jurídica de la cooperativa: asegúrese de que la copia esté actualizada y sea legible.",
                    "Prepare una lista de los miembros y sus funciones dentro de la cooperativa: INFOCOOP requiere esta información para el registro.",
                  ],
                  caveats: [
                    "Es importante que todos los documentos estén actualizados y que la información proporcionada sea precisa para evitar rechazos en la solicitud de afiliación.",
                  ],
                },
                {
                  subpaso: "Presente la solicitud de afiliación.",
                  detalle: [
                    "Visite la oficina de INFOCOOP o presente la solicitud en línea si está disponible.",
                    "Entregue toda la documentación requerida y asegúrese de recibir un comprobante de recepción.",
                    "Espere la respuesta de INFOCOOP sobre la afiliación: el instituto puede requerir información adicional o una visita a la cooperativa.",
                  ],
                  caveats: [
                    "INFOCOOP puede solicitar información adicional o una visita a la cooperativa, por lo que es importante estar preparado para cumplir con estos requisitos.",
                  ],
                },
                {
                  subpaso: "Obtenga la certificación de afiliación.",
                  detalle: [
                    "Una vez aprobada la afiliación, solicite una copia de la certificación: este documento es importante para futuras gestiones.",
                    "Guarde la certificación en un lugar seguro: también puede optar por tener una copia digital.",
                    "Contacte con INFOCOOP para conocer los programas de apoyo disponibles: ellos pueden ofrecer capacitación y asesoría técnica.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Cooperativa Activa",
              descripcion:
                "Realice las gestiones necesarias para mantener la cooperativa activa y en cumplimiento de sus obligaciones legales y fiscales.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos a la Caja Costarricense de Seguro Social (CCSS)",
                "Actas de asambleas ordinarias y extraordinarias",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos: asegúrese de utilizar el Número de Identificación Tributaria (NIT) de la cooperativa para ingresar.",
                    "Complete la declaración con los ingresos y gastos del mes: asegúrese de tener todos los recibos y facturas organizados para facilitar este proceso.",
                    "Pague el impuesto correspondiente antes de la fecha límite (generalmente el último día del mes): puede realizar el pago a través de transferencia bancaria o en cualquier banco autorizado.",
                  ],
                  caveats: [
                    "El pago puntual de los impuestos es esencial para evitar sanciones y mantener la cooperativa en regla con las autoridades fiscales.",
                  ],
                },
                {
                  subpaso: "Pago de la Caja Costarricense de Seguro Social (CCSS)",
                  detalle: [
                    "Calcule las cargas sociales que debe pagar cada mes en base a los salarios pagados a los empleados y miembros de la cooperativa: este cálculo puede hacerlo a través del sistema en línea de la CCSS.",
                    "Visite el portal de la CCSS o un banco autorizado para realizar el pago de las cargas sociales: el pago debe hacerse antes del día 15 de cada mes.",
                    "Guarde el comprobante de pago como respaldo para futuras auditorías o revisiones.",
                  ],
                  caveats: [
                    "El pago de la CCSS es obligatorio para garantizar los beneficios sociales de los miembros y empleados, y evitar sanciones legales.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y licencias de la cooperativa: estos permisos generalmente se deben renovar anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para presentar los documentos requeridos para la renovación: incluya una copia del permiso anterior y un comprobante de pago de impuestos municipales.",
                    "Pague las tarifas correspondientes y espere la aprobación de la renovación: asegúrese de guardar los comprobantes de pago y las nuevas licencias.",
                  ],
                  caveats: [
                    "No renovar los permisos y licencias a tiempo puede resultar en multas y en la suspensión de actividades de la cooperativa.",
                  ],
                },
                {
                  subpaso: "Asambleas Ordinarias y Extraordinarias",
                  detalle: [
                    "Programe una asamblea ordinaria al menos una vez al año para discutir el estado de la cooperativa y tomar decisiones importantes: asegúrese de notificar a todos los miembros con antelación.",
                    "Levante un acta de la asamblea y haga que todos los miembros la firmen: este documento es necesario para registrar cualquier decisión oficial tomada durante la reunión.",
                    "Si se requiere una asamblea extraordinaria para decisiones urgentes, notifique a los miembros y registre las decisiones en un acta: mantenga estos registros en un lugar seguro.",
                  ],
                  caveats: [
                    "Las asambleas ordinarias y extraordinarias son obligatorias para la toma de decisiones importantes y deben ser debidamente registradas.",
                  ],
                },
                {
                  subpaso: "Contabilidad y Reportes Anuales",
                  detalle: [
                    "Contrate a un contador para llevar los libros contables de la cooperativa: los libros deben estar actualizados y cumplir con las normativas del Ministerio de Hacienda.",
                    "Prepare el reporte anual de ingresos y gastos: asegúrese de incluir todas las facturas y recibos de cada transacción durante el año.",
                    "Presente el reporte anual al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o directamente con la ayuda del contador.",
                  ],
                  caveats: [
                    "La presentación de los reportes financieros anuales es obligatoria y debe ser precisa para evitar sanciones fiscales.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad en Comandita Simple",
          descripcion:
            "Una empresa de tipo Sociedad en Comandita Simple es una forma de organización empresarial que combina elementos de una sociedad de personas y una sociedad de capital. Se caracteriza por tener dos tipos de socios: los socios colectivos (o comanditados), que tienen responsabilidad ilimitada y gestionan la empresa, y los socios comanditarios, que tienen responsabilidad limitada al capital que aportan. Es una opción ideal cuando se requiere una combinación de gestión activa y aportación de capital sin involucrarse en la administración (Artículo 67 y 68 del Código de Comercio).",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Visite el sitio web del Registro Nacional.",
                  detalle: [
                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra empresa: intente varias alternativas por si el nombre deseado ya está tomado.",
                  ],
                  caveats: [
                    "El nombre de la empresa no debe ser igual o similar a uno ya registrado, para evitar problemas legales o de confusión en el mercado (Artículo 7 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Realice una consulta de disponibilidad de nombre.",
                  detalle: [
                    "Ingrese el nombre propuesto para la empresa en la barra de búsqueda: asegúrese de escribirlo correctamente para evitar errores en la búsqueda.",
                    "Espere los resultados de la consulta y revise posibles coincidencias: tome nota de cualquier nombre similar que pueda generar confusión.",
                    "Si el nombre está disponible, continúe con el proceso de registro: tome una captura de pantalla del resultado como respaldo.",
                  ],
                },
                {
                  subpaso: "Solicite la certificación para reservar el nombre.",
                  detalle: [
                    "Complete el formulario de solicitud para reservar el nombre: asegúrese de ingresar toda la información correctamente.",
                    "Presente el formulario en la oficina del Registro Nacional o envíelo electrónicamente: si lo hace en persona, verifique el horario de atención.",
                    "Pague la tarifa correspondiente para garantizar la reserva del nombre: guarde el recibo de pago como comprobante.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar Escritura de Constitución",
              descripcion:
                "Redacte la escritura de constitución con la asistencia de un abogado, que incluya información sobre los socios colectivos y comanditarios, capital aportado y administración.",
              documentos: [
                "Escritura de Constitución",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción de la escritura de constitución.",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Programe una reunión para discutir los detalles de la sociedad: prepare información sobre los socios y el capital que aportará cada uno.",
                    "Asegúrese de llevar documentos de identificación de todos los socios: cédulas de identidad o pasaportes vigentes.",
                  ],
                  caveats: [
                    "La asesoría legal es esencial para garantizar que la escritura cumpla con todas las regulaciones legales aplicables (Artículo 67 del Código de Comercio).",
                  ],
                },
                {
                  subpaso:
                    "Detallar las características específicas de la Sociedad en Comandita Simple.",
                  detalle: [
                    "Identificar a los socios colectivos y comanditarios: los socios colectivos tienen responsabilidad ilimitada, mientras que los comanditarios tienen responsabilidad limitada al capital aportado (Artículo 68 del Código de Comercio).",
                    "Especificar el capital aportado por cada socio: detallar las aportaciones en dinero o en especie.",
                    "Definir la administración de la sociedad: generalmente, los socios colectivos administran la sociedad.",
                  ],
                  caveats: [
                    "Es importante que todos los socios comprendan sus roles y responsabilidades dentro de la sociedad para evitar conflictos futuros.",
                  ],
                },
                {
                  subpaso: "Firme la escritura ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar la escritura: asegure la presencia de todos los socios.",
                    "Todos los socios deben presentar su identificación vigente al momento de la firma.",
                    "El notario dará fe de la autenticidad de las firmas y la validez del documento: solicite copias certificadas para cada socio.",
                  ],
                  caveats: [
                    "La firma ante notario es obligatoria para que la escritura tenga validez legal (Artículo 68 del Código de Comercio).",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la sociedad en comandita simple en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Escritura de Constitución autenticada",
                "Certificación de disponibilidad de nombre",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Obtenga el formulario de inscripción en el Registro Nacional o descárguelo de su sitio web.",
                    "Complete la información requerida sobre la sociedad y los socios: asegúrese de la exactitud de los datos.",
                    "Adjunte los documentos necesarios, incluyendo la escritura autenticada y la certificación de nombre.",
                  ],
                  caveats: [
                    "La omisión de información o documentos puede retrasar el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Entregue todos los documentos en la oficina del Registro Nacional: confirme el horario de atención y requisitos específicos.",
                    "Pague las tarifas correspondientes al registro de la sociedad: guarde el comprobante de pago.",
                    "Espere la revisión y aprobación de la documentación: el Registro Nacional notificará si hay observaciones o si se requiere información adicional.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se completen todos los requisitos y se realicen los pagos correspondientes.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica.",
                  detalle: [
                    "Una vez inscrita, solicite una copia de la personería jurídica de la sociedad.",
                    "Guarde este documento en un lugar seguro: es necesario para realizar trámites legales y financieros.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y gestionar otros asuntos en nombre de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción Tributaria",
              descripcion:
                "Registre la sociedad como contribuyente ante el Ministerio de Hacienda y obtenga el Número de Identificación Tributaria (NIT).",
              documentos: [
                "Formulario D-140",
                "Documento de identidad del representante legal",
                "Personería jurídica",
              ],
              subpasos: [
                {
                  subpaso: "Registro en el Ministerio de Hacienda",
                  detalle: [
                    "Acceda al portal ATV del Ministerio de Hacienda y complete el formulario D-140 con los datos de la sociedad.",
                    "Adjunte los documentos requeridos: personería jurídica y cédula del representante legal.",
                    "Espere la confirmación del registro y obtenga el NIT para trámites tributarios.",
                  ],
                  caveats: [
                    "El NIT es indispensable para cualquier actividad comercial y tributaria de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abra una cuenta bancaria a nombre de la sociedad para manejar sus operaciones financieras.",
              documentos: [
                "Escritura de Constitución",
                "Personería jurídica",
                "Cédula del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Seleccionar el Banco",
                  detalle: [
                    "Investigue las opciones bancarias disponibles que ofrezcan cuentas empresariales adecuadas.",
                    "Compare tarifas, requisitos y servicios adicionales que puedan ser beneficiosos para la sociedad.",
                    "Seleccione el banco que mejor se adapte a las necesidades de la empresa.",
                  ],
                },
                {
                  subpaso: "Apertura de la Cuenta",
                  detalle: [
                    "Contacte al banco y programe una cita para abrir la cuenta empresarial.",
                    "Presente todos los documentos requeridos: escritura de constitución, personería jurídica y cédula del representante legal.",
                    "Complete los formularios proporcionados por el banco y realice el depósito inicial si es necesario.",
                  ],
                  caveats: [
                    "Asegúrese de entender las condiciones y obligaciones asociadas con la cuenta bancaria empresarial.",
                  ],
                },
              ],
            },
            {
              paso: "Obtención de Permisos y Licencias",
              descripcion:
                "Gestione los permisos y licencias necesarios para operar legalmente.",
              documentos: [
                "Permiso de funcionamiento del Ministerio de Salud",
                "Patente municipal",
                "Inscripción en la Caja Costarricense de Seguro Social (CCSS)",
              ],
              subpasos: [
                {
                  subpaso: "Permiso del Ministerio de Salud",
                  detalle: [
                    "Complete el formulario de solicitud de permiso de funcionamiento: disponible en el sitio web del Ministerio de Salud.",
                    "Adjunte los documentos requeridos: planos del local, certificaciones, etc.",
                    "Presente la solicitud en la oficina regional correspondiente y pague las tasas aplicables.",
                  ],
                  caveats: [
                    "El permiso es obligatorio para actividades que puedan afectar la salud pública.",
                  ],
                },
                {
                  subpaso: "Obtención de la Patente Municipal",
                  detalle: [
                    "Visite la municipalidad donde operará la empresa para solicitar la patente comercial.",
                    "Complete el formulario de solicitud y adjunte los documentos necesarios: permiso del Ministerio de Salud, personería jurídica, etc.",
                    "Pague las tarifas correspondientes y espere la aprobación de la patente.",
                  ],
                  caveats: [
                    "Operar sin patente municipal puede resultar en sanciones y cierre del establecimiento.",
                  ],
                },
                {
                  subpaso: "Inscripción en la CCSS",
                  detalle: [
                    "Registre la sociedad en la CCSS para cumplir con las obligaciones laborales y sociales.",
                    "Complete el formulario de inscripción y presente la documentación requerida: personería jurídica, cédulas de los socios, etc.",
                    "Obtenga el número de patrono y mantenga al día los pagos de cargas sociales.",
                  ],
                  caveats: [
                    "El incumplimiento con la CCSS puede generar multas y afectar la reputación de la empresa.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Sociedad Activa",
              descripcion:
                "Cumpla con las obligaciones fiscales y administrativas para mantener la sociedad en regla.",
              documentos: [
                "Declaraciones tributarias",
                "Comprobantes de pago de cargas sociales",
                "Renovación de permisos y licencias",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Periódicas",
                  detalle: [
                    "Presente las declaraciones de impuestos según corresponda: mensuales, trimestrales o anuales.",
                    "Utilice el portal ATV del Ministerio de Hacienda para realizar las declaraciones en línea.",
                    "Mantenga registros contables actualizados para facilitar el proceso.",
                  ],
                  caveats: [
                    "El atraso o incumplimiento en las declaraciones puede generar multas y recargos.",
                  ],
                },
                {
                  subpaso: "Pago de Cargas Sociales",
                  detalle: [
                    "Realice los pagos mensuales a la CCSS en base a los salarios de los empleados.",
                    "Utilice los sistemas en línea o acuda a las oficinas de la CCSS para efectuar los pagos.",
                    "Conserve los comprobantes de pago como respaldo.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise periódicamente las fechas de vencimiento de los permisos y licencias.",
                    "Realice los trámites de renovación con anticipación para evitar interrupciones en las operaciones.",
                    "Actualice cualquier cambio en la información de la sociedad ante las autoridades correspondientes.",
                  ],
                },
                {
                  subpaso: "Actualización Registral",
                  detalle: [
                    "Notifique al Registro Nacional cualquier cambio en la estructura de la sociedad: ingreso o salida de socios, modificaciones en el capital, etc.",
                    "Presente la documentación correspondiente y pague las tasas requeridas.",
                    "Mantenga la información de la sociedad actualizada para evitar problemas legales.",
                  ],
                  caveats: [
                    "La falta de actualización puede resultar en sanciones y complicaciones legales.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad en Comandita por Acciones",
          descripcion:
            "Una Sociedad en Comandita por Acciones (S.C.A.) es una forma de sociedad mercantil que combina características de las sociedades de personas y de capital. En una Sociedad en Comandita por Acciones, existen dos tipos de socios: los comanditados, que participan de manera activa en la gestión de la empresa y tienen responsabilidad ilimitada, y los comanditarios, que son inversores que aportan capital y cuya responsabilidad está limitada al valor de sus acciones. Este tipo de sociedad ofrece flexibilidad en la estructura de la gestión y la participación de los socios.",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Visite el sitio web del Registro Nacional.",
                  detalle: [
                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra empresa: intente varias alternativas por si el nombre deseado ya está tomado.",
                  ],
                  caveats: [
                    "El nombre de la empresa no debe ser igual o similar a uno ya registrado, para evitar problemas legales o de confusión en el mercado.",
                  ],
                },
                {
                  subpaso: "Realice una consulta de disponibilidad de nombre.",
                  detalle: [
                    "Ingrese el nombre propuesto para la empresa en la barra de búsqueda: asegúrese de escribirlo correctamente para evitar errores en la búsqueda.",
                    "Espere los resultados de la consulta y revise posibles coincidencias: tome nota de cualquier nombre similar que pueda generar confusión.",
                    "Si el nombre está disponible, continúe con el proceso de registro: tome una captura de pantalla del resultado como respaldo.",
                  ],
                },
                {
                  subpaso: "Solicite la certificación para reservar el nombre.",
                  detalle: [
                    "Complete el formulario de solicitud para reservar el nombre: asegúrese de ingresar toda la información correctamente.",
                    "Presente el formulario en la oficina del Registro Nacional o envíelo electrónicamente: si lo hace en persona, verifique el horario de atención.",
                    "Pague la tarifa correspondiente para garantizar la reserva del nombre: guarde el recibo de pago como comprobante.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar Escritura Pública",
              descripcion:
                "Redacte la escritura pública de constitución de la sociedad en comandita por acciones con la asistencia de un abogado, incluyendo información sobre los socios comanditados y comanditarios, capital social y administración.",
              documentos: [
                "Escritura Pública de Constitución",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción de la escritura pública.",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Programe una reunión para discutir los detalles de la sociedad: prepare una lista de preguntas sobre el proceso y costos involucrados.",
                    "Asegúrese de llevar información de los socios, incluyendo nombres completos y copias de identificación: distinga entre socios comanditados y comanditarios.",
                  ],
                  caveats: [
                    "La escritura pública debe ser redactada por un abogado para garantizar el cumplimiento de la legislación vigente y especificar claramente las responsabilidades de los socios.",
                  ],
                },
                {
                  subpaso:
                    "Especifique los roles de los socios y el capital inicial.",
                  detalle: [
                    "Identifique a los socios comanditados (con responsabilidad ilimitada) y a los socios comanditarios (con responsabilidad limitada): esto debe quedar claramente establecido en la escritura.",
                    "Defina la cantidad de acciones y la participación de cada socio comanditario: establezca cómo se dividirán las ganancias y responsabilidades.",
                    "Determine el capital social y cómo será aportado: asegúrese de que todos los socios estén de acuerdo con la distribución propuesta.",
                  ],
                  caveats: [
                    "Es fundamental que los roles y responsabilidades de cada tipo de socio estén claramente definidos para evitar conflictos futuros.",
                  ],
                },
                {
                  subpaso: "Firme la escritura pública ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar la escritura: confirme la disponibilidad de todos los socios antes de fijar la fecha.",
                    "Asegúrese de que todos los socios estén presentes y lleven identificación: revise los requisitos del notario para asegurarse de cumplirlos.",
                    "El notario autenticará las firmas y dará fe de la validez del documento: solicite copias certificadas para cada socio.",
                  ],
                  caveats: [
                    "La firma ante notario es esencial para darle validez legal a la escritura pública y garantizar que todos los socios estén debidamente representados.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la sociedad en comandita por acciones en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Escritura Pública de Constitución autenticada",
                "Certificación de disponibilidad de nombre",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para obtener el formulario de inscripción.",
                    "Complete toda la información requerida sobre los socios y la empresa: asegúrese de que los datos sean precisos.",
                    "Adjunte todos los documentos necesarios, incluyendo la escritura pública autenticada y la certificación de nombre.",
                  ],
                  caveats: [
                    "Es imprescindible adjuntar todos los documentos requeridos para evitar demoras en el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Presente todos los documentos en la oficina del Registro Nacional: verifique el horario de atención para evitar inconvenientes.",
                    "Pague las tarifas correspondientes al registro de la sociedad: conserve el recibo de pago como comprobante.",
                    "Espere la revisión de la documentación por parte del Registro Nacional: le indicarán si hay algún problema o si se requiere algún documento adicional.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se paguen todas las tarifas correspondientes y se presente toda la documentación requerida.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica.",
                  detalle: [
                    "Una vez aprobado el registro, solicite una copia de la personería jurídica: este documento es necesario para realizar otras gestiones a nombre de la empresa.",
                    "Guarde la personería jurídica en un lugar seguro: también puede optar por tener una copia digital.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y llevar a cabo otras gestiones legales en nombre de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Constitución de la Sociedad en Comandita por Acciones",
              descripcion:
                "Formalice la creación de la sociedad mediante la inscripción de la escritura pública y los estatutos en el Registro Nacional.",
              documentos: [
                "Escritura Pública de Constitución",
                "Estatutos de la sociedad",
                "Lista de socios comanditados y comanditarios",
              ],
              subpasos: [
                {
                  subpaso: "Redacción de los Estatutos",
                  detalle: [
                    "Contrate a un abogado para redactar los estatutos de la sociedad, que incluyan el nombre, objeto social, capital social, estructura de administración, y derechos y obligaciones de los socios.",
                    "Reúnase con los socios para acordar los términos de los estatutos y asegurarse de que todos estén de acuerdo con las condiciones establecidas.",
                    "Una vez aprobados, firme los estatutos ante un notario público para darles validez legal.",
                  ],
                  caveats: [
                    "Es crucial que los estatutos sean claros y precisos, ya que definirán las reglas internas de la sociedad y evitarán posibles conflictos futuros.",
                  ],
                },
                {
                  subpaso: "Registro en el Registro Nacional",
                  detalle: [
                    "Visite el Registro Nacional o utilice su portal en línea para presentar la escritura pública y los estatutos.",
                    "Complete el formulario de inscripción y pague las tasas correspondientes al registro de la sociedad.",
                    "Espere la confirmación del Registro Nacional y guarde el documento de personería jurídica.",
                  ],
                  caveats: [
                    "El registro de la escritura y los estatutos debe ser realizado de forma oportuna para que la sociedad sea reconocida legalmente.",

                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad en Nombre Colectivo",
          descripcion:
            "Una Sociedad en Nombre Colectivo es una forma de organización empresarial en la cual dos o más socios se asocian para realizar actividades comerciales bajo una razón social común. Esta sociedad es conocida por la responsabilidad ilimitada y solidaria de sus socios, lo que significa que cada uno de ellos puede ser responsable por las deudas y obligaciones de la empresa con todo su patrimonio personal (Art. 38 del Código de Comercio).",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Visite el sitio web del Registro Nacional.",
                  detalle: [
                    "Ingrese a la página oficial del Registro Nacional: asegúrese de que el sitio web sea legítimo y seguro.",
                    "Busque la opción de consulta de nombres de sociedades: puede utilizar la barra de navegación o la sección de 'Trámites en Línea'.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra empresa: intente varias alternativas por si el nombre deseado ya está tomado.",
                  ],
                  caveats: [
                    "El nombre de la empresa no debe ser igual o similar a uno ya registrado, para evitar problemas legales o de confusión en el mercado.",
                  ],
                },
                {
                  subpaso: "Realice una consulta de disponibilidad de nombre.",
                  detalle: [
                    "Ingrese el nombre propuesto para la empresa en la barra de búsqueda: asegúrese de escribirlo correctamente para evitar errores en la búsqueda.",
                    "Espere los resultados de la consulta y revise posibles coincidencias: tome nota de cualquier nombre similar que pueda generar confusión.",
                    "Si el nombre está disponible, continúe con el proceso de registro: tome una captura de pantalla del resultado como respaldo.",
                  ],
                },
                {
                  subpaso: "Solicite la certificación para reservar el nombre.",
                  detalle: [
                    "Complete el formulario de solicitud para reservar el nombre: asegúrese de ingresar toda la información correctamente.",
                    "Presente el formulario en la oficina del Registro Nacional o envíelo electrónicamente: si lo hace en persona, verifique el horario de atención.",
                    "Pague la tarifa correspondiente para garantizar la reserva del nombre: guarde el recibo de pago como comprobante.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar Contrato Social",
              descripcion:
                "Redacte el contrato social con la asistencia de un abogado, que incluya información sobre los socios, capital aportado y administración.",
              documentos: ["Contrato Social", "Identificación de los socios"],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción del contrato social.",
                  detalle: [
                    "Busque un abogado especializado en derecho mercantil: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Contacte al abogado y programe una reunión para discutir los detalles de la sociedad: prepare una lista de preguntas sobre el proceso y costos involucrados.",
                    "Asegúrese de llevar información de los socios, incluyendo nombres completos y copias de identificación: confirme que cada socio tenga sus documentos en regla.",
                  ],
                  caveats: [
                    "Es obligatorio que el contrato social sea redactado por un abogado especializado en derecho mercantil, para garantizar el cumplimiento de la legislación vigente.",
                  ],
                },
                {
                  subpaso:
                    "Incluya información detallada sobre los socios y el capital aportado.",
                  detalle: [
                    "Especifique la participación y responsabilidades de cada socio: defina claramente cómo se dividirán las ganancias y responsabilidades.",
                    "Defina el monto del capital aportado por cada socio y cómo será administrado: asegúrese de que todos los socios estén de acuerdo con la distribución propuesta.",
                    "Incluya la información de contacto de cada socio y sus responsabilidades: verifique que cada socio entienda sus responsabilidades y esté dispuesto a cumplirlas.",
                  ],
                  caveats: [
                    "Todos los socios tienen responsabilidad ilimitada y solidaria en una Sociedad en Nombre Colectivo, por lo que es esencial que estén de acuerdo con las condiciones establecidas (Art. 39 del Código de Comercio).",
                  ],
                },
                {
                  subpaso: "Firme el contrato social ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar el contrato: confirme la disponibilidad de todos los socios antes de fijar la fecha.",
                    "Asegúrese de que todos los socios estén presentes y lleven identificación: revise los requisitos del notario para asegurarse de cumplirlos.",
                    "El notario autenticará las firmas y dará fe de la validez del documento: solicite una copia certificada del documento para cada socio.",
                  ],
                  caveats: [
                    "La firma ante notario es esencial para darle validez legal al contrato social y garantizar que todos los socios estén debidamente representados.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la Sociedad en Nombre Colectivo en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Contrato Social autenticado",
                "Certificación de disponibilidad de nombre",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para obtener el formulario de inscripción.",
                    "Complete toda la información requerida sobre los socios y la empresa: asegúrese de que los datos sean precisos.",
                    "Adjunte todos los documentos necesarios, incluyendo el contrato social autenticado y la certificación de nombre.",
                  ],
                  caveats: [
                    "Es imprescindible adjuntar todos los documentos requeridos para evitar demoras en el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Presente todos los documentos en la oficina del Registro Nacional: verifique el horario de atención para evitar inconvenientes.",
                    "Pague las tarifas correspondientes al registro de la sociedad: conserve el recibo de pago como comprobante.",
                    "Espere la revisión de la documentación por parte del Registro Nacional: ellos le indicarán si hay algún problema o si se requiere algún documento adicional.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se paguen todas las tarifas correspondientes y se presente toda la documentación requerida.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica.",
                  detalle: [
                    "Una vez aprobado el registro, solicite una copia de la personería jurídica: este documento es necesario para realizar otras gestiones a nombre de la empresa.",
                    "Guarde la personería jurídica en un lugar seguro: también puede optar por tener una copia digital.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y llevar a cabo otras gestiones legales en nombre de la sociedad.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción Tributaria",
              descripcion:
                "Registre la sociedad como contribuyente ante el Ministerio de Hacienda y obtenga el Número de Identificación Tributaria (NIT).",
              documentos: [
                "Formulario D-140",
                "Documento de identidad de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Registro en el Ministerio de Hacienda",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda y complete el formulario D-140 con los datos de la sociedad.",
                    "Adjunte los documentos requeridos, como las cédulas de los socios y el contrato social.",
                    "Espere la confirmación del registro y obtenga el NIT, que se usará para todos los trámites tributarios.",
                  ],
                  caveats: [
                    "El NIT es fundamental para cualquier transacción tributaria y debe obtenerse antes de realizar actividades comerciales.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abra una cuenta bancaria a nombre de la sociedad para manejar sus operaciones financieras.",
              documentos: [
                "Contrato Social",
                "Personería jurídica",
                "Cédulas de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Contactar al Banco",
                  detalle: [
                    "Seleccione un banco que ofrezca condiciones adecuadas para la cuenta empresarial y comuníquese con un asesor.",
                    "Solicite una cita para la apertura de la cuenta: explique que se trata de una Sociedad en Nombre Colectivo recién constituida y que necesita una cuenta para sus operaciones.",
                    "Prepare los documentos requeridos y preséntese el día de la cita en la sucursal bancaria seleccionada.",
                  ],
                  caveats: [
                    "Es importante seleccionar un banco que ofrezca productos financieros adecuados para el tipo de actividad que realizará la sociedad.",
                  ],
                },
                {
                  subpaso: "Apertura de la Cuenta",
                  detalle: [
                    "Complete los formularios del banco para la apertura de la cuenta: asegúrese de proporcionar toda la información de la sociedad, incluyendo el NIT y la personería jurídica.",
                    "Deposite el monto mínimo requerido para abrir la cuenta, si aplica: este monto puede variar según el banco.",
                    "Guarde todos los comprobantes relacionados con la apertura de la cuenta, ya que serán necesarios para futuras transacciones.",
                  ],
                },
              ],
            },
            {
              paso: "Obtener Permisos y Licencias Necesarios",
              descripcion:
                "Adquiera los permisos y licencias necesarios para operar legalmente.",
              documentos: [
                "Permiso de funcionamiento del Ministerio de Salud",
                "Patente municipal",
              ],
              subpasos: [
                {
                  subpaso: "Solicitar Permiso de Funcionamiento",
                  detalle: [
                    "Visite el Ministerio de Salud para solicitar el permiso de funcionamiento: lleve consigo la personería jurídica y el contrato social.",
                    "Complete los formularios requeridos y pague las tarifas correspondientes.",
                    "Espere la inspección y aprobación por parte del Ministerio de Salud.",
                  ],
                  caveats: [
                    "Operar sin el permiso de funcionamiento puede resultar en sanciones y cierre del establecimiento.",
                  ],
                },
                {
                  subpaso: "Obtener Patente Municipal",
                  detalle: [
                    "Diríjase a la municipalidad correspondiente para solicitar la patente comercial.",
                    "Proporcione la documentación requerida, que puede incluir la personería jurídica, contrato social y permiso de funcionamiento.",
                    "Pague las tarifas correspondientes y espere la emisión de la patente.",
                  ],
                  caveats: [
                    "La patente municipal es obligatoria para realizar actividades comerciales en la jurisdicción correspondiente.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Sociedad Activa",
              descripcion:
                "Cumpla con las obligaciones fiscales y administrativas para mantener la sociedad en regla.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos de la CCSS",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos mensuales: use el NIT para ingresar.",
                    "Complete la declaración con los ingresos y gastos de la sociedad: tenga a mano los libros contables y facturas.",
                    "Pague el impuesto antes de la fecha límite para evitar multas: puede realizar el pago en línea o en un banco autorizado.",
                  ],
                  caveats: [
                    "Es fundamental realizar las declaraciones tributarias a tiempo para evitar sanciones económicas y posibles problemas legales.",
                  ],
                },
                {
                  subpaso: "Pago de la CCSS",
                  detalle: [
                    "Calcule las cargas sociales mensuales en base a los salarios de los empleados: este cálculo puede hacerse a través del sistema en línea de la CCSS.",
                    "Realice el pago de las cargas sociales antes del día 15 de cada mes: puede hacer el pago en línea o en un banco autorizado.",
                    "Guarde el comprobante del pago como respaldo para auditorías.",
                  ],
                  caveats: [
                    "El pago puntual de la CCSS es obligatorio para evitar sanciones y garantizar los beneficios sociales a los empleados.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y patentes de la sociedad: generalmente se renuevan anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para renovar los permisos: presente el comprobante de pago de impuestos y otros documentos requeridos.",
                    "Pague las tarifas correspondientes y guarde los comprobantes.",
                  ],
                  caveats: [
                    "No renovar los permisos y licencias a tiempo puede resultar en multas y posibles sanciones, incluyendo la suspensión de actividades.",
                  ],
                },
                {
                  subpaso: "Reportes Financieros Anuales",
                  detalle: [
                    "Contrate a un contador para preparar los estados financieros anuales de la sociedad.",
                    "Presente el reporte anual de ingresos y gastos al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o con ayuda del contador.",
                    "Asegúrese de cumplir con todas las normativas contables y fiscales para evitar sanciones.",
                  ],
                  caveats: [
                    "La presentación de reportes financieros anuales es obligatoria y debe ser precisa para evitar sanciones por parte de las autoridades fiscales.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Empresa Individual de Responsabilidad Limitada (E.I.R.L.)",
          descripcion:
            "Una Empresa Individual de Responsabilidad Limitada (E.I.R.L.) es un tipo de organización empresarial constituida por una sola persona, que tiene la ventaja de ofrecer responsabilidad limitada al propietario. Este tipo de empresa es una persona jurídica independiente del propietario, lo cual significa que sus bienes y obligaciones están separados de los bienes personales del titular, protegiendo así el patrimonio personal del empresario. La E.I.R.L. combina la simplicidad de una propiedad individual con la protección de responsabilidad limitada propia de sociedades mercantiles, siendo su constitución regulada por disposiciones específicas del Código de Comercio de Costa Rica (Artículo 9 del Código de Comercio).",
          pasos: [
            {
              paso: "Definir Nombre de la Empresa",
              descripcion:
                "Verifique la disponibilidad del nombre de la empresa en el Registro Nacional o Registro de Comercio.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Consultar disponibilidad del nombre",
                  detalle: [
                    "Visite el sitio web del Registro Nacional o Registro de Comercio correspondiente: asegúrese de utilizar fuentes oficiales para la consulta.",
                    "Utilice la herramienta de búsqueda para verificar si el nombre deseado está disponible: ingrese variantes del nombre para aumentar las opciones.",
                    "Considere alternativas si el nombre ya está registrado: prepare una lista de nombres alternativos aceptables.",
                  ],
                  caveats: [
                    "El nombre debe ser único y no puede generar confusión con otras empresas registradas para evitar problemas legales.",
                  ],
                },
                {
                  subpaso: "Reservar el nombre de la empresa",
                  detalle: [
                    "Complete el formulario de solicitud de reserva de nombre: proporcione todos los datos solicitados de manera precisa.",
                    "Pague la tarifa correspondiente a la reserva del nombre: conserve el comprobante de pago.",
                    "Obtenga la certificación de reserva o disponibilidad del nombre: este documento será necesario para trámites posteriores.",
                  ],
                },
              ],
            },
            {
              paso: "Redactar Estatuto de Constitución",
              descripcion:
                "Prepare el estatuto de constitución de la E.I.R.L., que establece las reglas y regulaciones de la empresa.",
              documentos: ["Estatuto de Constitución"],
              subpasos: [
                {
                  subpaso: "Contratar a un abogado",
                  detalle: [
                    "Encuentre un abogado con experiencia en derecho corporativo: solicite referencias o busque en directorios profesionales.",
                    "Proporcione al abogado la información necesaria para redactar el estatuto: detalles sobre el objeto social, capital, administración, etc.",
                    "Revise el borrador del estatuto y realice las modificaciones necesarias: asegúrese de que todos los detalles sean correctos.",
                  ],
                  caveats: [
                    "Aunque no siempre es obligatorio, se recomienda la asistencia de un abogado para asegurar el cumplimiento legal y evitar errores.",
                  ],
                },
                {
                  subpaso: "Incluir información esencial en el estatuto",
                  detalle: [
                    "Definir el objeto social de la empresa: detalle las actividades comerciales que realizará (Artículo 3 del Código de Comercio).",
                    "Establecer el capital social y su forma de pago: especifique el monto y cómo se aportará (efectivo, bienes, etc.).",
                    "Detallar la administración y representación legal de la empresa: indique cómo se tomarán las decisiones y quién será el representante legal (Artículo 5 del Código de Comercio).",
                  ],
                  caveats: [
                    "El estatuto debe cumplir con las leyes y regulaciones vigentes para E.I.R.L. para ser válido legalmente.",
                  ],
                },
              ],
            },
            {
              paso: "Otorgar Escritura Pública",
              descripcion:
                "Formalice el estatuto de constitución mediante escritura pública ante un notario.",
              documentos: [
                "Estatuto de Constitución",
                "Documento de identidad del propietario",
              ],
              subpasos: [
                {
                  subpaso: "Programar cita con el notario",
                  detalle: [
                    "Seleccione un notario de confianza: puede basarse en recomendaciones o cercanía geográfica.",
                    "Programe una cita y confirme los documentos necesarios: algunos notarios pueden requerir documentación adicional.",
                    "Prepare los documentos requeridos para la cita: organícelos en un folder para facilitar el proceso.",
                  ],
                },
                {
                  subpaso: "Firmar la escritura pública",
                  detalle: [
                    "Asista a la cita con el notario: llegue puntual para evitar retrasos.",
                    "Presente los documentos y firme la escritura pública: el notario certificará la validez del documento.",
                    "Pague los honorarios notariales y obtenga una copia autorizada de la escritura: guarde este documento en un lugar seguro.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro de Comercio",
              descripcion:
                "Inscriba la empresa en el Registro de Comercio para obtener personalidad jurídica.",
              documentos: [
                "Escritura Pública",
                "Formulario de inscripción",
                "Comprobante de pago de tasas registrales",
              ],
              subpasos: [
                {
                  subpaso: "Presentar documentos al Registro",
                  detalle: [
                    "Diríjase al Registro de Comercio correspondiente: verifique el horario de atención y si es necesario agendar una cita.",
                    "Complete el formulario de inscripción con los datos de la empresa: revise que no haya errores antes de entregarlo.",
                    "Adjunte la escritura pública y otros documentos requeridos: asegúrese de que las copias sean legibles y estén certificadas si es necesario.",
                    "Pague las tasas de inscripción: conserve el recibo de pago como comprobante.",
                  ],
                  caveats: [
                    "Asegúrese de que toda la documentación esté completa para evitar retrasos en el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Obtener certificación de inscripción",
                  detalle: [
                    "Espere la revisión y aprobación del Registro de Comercio: este proceso puede tomar varios días hábiles.",
                    "Reciba el certificado de inscripción o personería jurídica: este documento confirma la existencia legal de su empresa.",
                    "Guarde el certificado para futuros trámites legales: puede ser necesario para abrir cuentas bancarias o contratar servicios.",
                  ],
                },
              ],
            },
            {
              paso: "Obtener Número de Identificación Tributaria (NIT/RUT)",
              descripcion:
                "Registre la empresa ante la autoridad tributaria para obtener el número de identificación fiscal.",
              documentos: [
                "Formulario de registro tributario",
                "Documento de identidad",
                "Escritura Pública",
                "Certificado de inscripción en el Registro de Comercio",
              ],
              subpasos: [
                {
                  subpaso: "Registrar la empresa en la entidad tributaria",
                  detalle: [
                    "Visite la oficina de la autoridad tributaria o realice el trámite en línea, si está disponible: verifique los requisitos en el sitio web oficial.",
                    "Complete el formulario de registro con los datos de la empresa y del propietario: asegúrese de que la información sea exacta.",
                    "Adjunte los documentos requeridos: verifique si necesitan ser presentados en original o copia certificada.",
                    "Pague cualquier tasa asociada al registro, si aplica: conserve el comprobante de pago.",
                  ],
                  caveats: [
                    "El NIT/RUT es esencial para las operaciones comerciales y tributarias de la empresa; sin él, no podrá facturar legalmente.",
                  ],
                },
                {
                  subpaso: "Obtener el certificado de registro tributario",
                  detalle: [
                    "Reciba el NIT/RUT asignado a la empresa: anótelo y memorícelo, ya que lo usará frecuentemente.",
                    "Guarde el certificado o constancia para futuras gestiones: es posible que necesite presentarlo a proveedores o clientes.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en la Seguridad Social",
              descripcion:
                "Registre la empresa y al propietario en la entidad de seguridad social para cumplir con las obligaciones laborales.",
              documentos: [
                "Formulario de inscripción",
                "Documento de identidad",
                "Escritura Pública",
                "Certificado de inscripción en el Registro de Comercio",
              ],
              subpasos: [
                {
                  subpaso: "Registrar en la entidad de seguridad social",
                  detalle: [
                    "Acuda a la oficina de la seguridad social correspondiente: puede ser el Instituto de Seguridad Social o equivalente en su país.",
                    "Complete el formulario de inscripción para el empleador y los trabajadores, si aplica: incluso si no tiene empleados actualmente.",
                    "Proporcione la información y documentos requeridos: asegúrese de que estén actualizados y en buen estado.",
                  ],
                  caveats: [
                    "Incluso si no tiene empleados, puede ser necesario registrarse para futuras contrataciones y para cotizar como trabajador independiente.",
                  ],
                },
                {
                  subpaso: "Cumplir con las obligaciones de seguridad social",
                  detalle: [
                    "Realice los pagos correspondientes a la seguridad social: estos pueden ser mensuales o trimestrales.",
                    "Mantenga registros de los pagos y cumplimiento de obligaciones: esto es crucial en caso de auditorías o inspecciones.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria Empresarial",
              descripcion:
                "Abra una cuenta bancaria a nombre de la empresa para gestionar las operaciones financieras.",
              documentos: [
                "Documento de identidad",
                "Escritura Pública",
                "Certificado de inscripción en el Registro de Comercio",
                "NIT/RUT",
              ],
              subpasos: [
                {
                  subpaso: "Seleccionar entidad bancaria",
                  detalle: [
                    "Investigue las opciones bancarias y elija la que mejor se adapte a las necesidades de su empresa: considere comisiones, servicios y facilidades.",
                    "Contacte al banco para conocer los requisitos y procedimientos: algunos bancos ofrecen la posibilidad de iniciar el proceso en línea.",
                  ],
                },
                {
                  subpaso: "Abrir la cuenta bancaria",
                  detalle: [
                    "Reúna los documentos solicitados por el banco: verifique si requieren originales o copias certificadas.",
                    "Acuda a la sucursal bancaria para completar el proceso de apertura: puede ser necesario agendar una cita previa.",
                    "Deposite el monto mínimo requerido, si aplica: algunos bancos exigen un saldo mínimo para cuentas empresariales.",
                  ],
                },
              ],
            },
            {
              paso: "Cumplimiento de Obligaciones Legales y Fiscales",
              descripcion:
                "Mantenga la empresa en regla cumpliendo con las obligaciones legales y fiscales.",
              documentos: [
                "Comprobantes de pago de impuestos",
                "Declaraciones tributarias",
                "Registros contables",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones y pagos de impuestos",
                  detalle: [
                    "Realice las declaraciones tributarias en los plazos establecidos: consulte el calendario fiscal para no omitir fechas importantes.",
                    "Pague los impuestos correspondientes a tiempo: puede hacerlo en línea o en entidades bancarias autorizadas.",
                    "Utilice el NIT/RUT para todas las gestiones tributarias: asegúrese de que esté siempre activo y sin problemas.",
                  ],
                  caveats: [
                    "El incumplimiento de obligaciones fiscales puede resultar en multas, sanciones y problemas legales que afecten su negocio.",
                  ],
                },
                {
                  subpaso: "Mantener registros contables",
                  detalle: [
                    "Lleve una contabilidad ordenada y actualizada: esto facilita la toma de decisiones y el cumplimiento fiscal.",
                    "Contrate a un contador si es necesario: un profesional puede ayudarle a optimizar recursos y evitar errores.",
                    "Conserve todos los comprobantes y documentos fiscales: esto es crucial en caso de auditorías o requerimientos legales.",
                  ],
                },
                {
                  subpaso: "Renovación de permisos y licencias",
                  detalle: [
                    "Verifique las fechas de vencimiento de permisos o licencias: anótelas en un calendario o sistema de recordatorios.",
                    "Realice las renovaciones oportunamente para evitar sanciones: algunos trámites pueden iniciarse antes del vencimiento.",
                  ],
                  caveats: [
                    "No renovar a tiempo puede llevar a la suspensión de actividades y afectará la reputación de su empresa.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad Civil",
          descripcion:
            "Una empresa de tipo Sociedad Civil es una forma de organización empresarial en la que dos o más personas se asocian con el propósito de llevar a cabo actividades de naturaleza profesional o no comercial, es decir, actividades que no tienen fines mercantiles como objetivo principal. Es comúnmente utilizada por profesionales que desean unir sus esfuerzos para ofrecer servicios especializados, tales como abogados, arquitectos, médicos, contadores, ingenieros, entre otros. Esta sociedad puede generar lucro, pero siempre en beneficio de sus socios y no con fines comerciales directos. Según el Código Civil, esta figura se rige por los artículos 1196 y siguientes, los cuales establecen el marco legal de la sociedad civil y las reglas de administración, distribución de utilidades, y disolución (Artículo 1196, Código Civil)【36†source】.",
          pasos: [
            {
              paso: "Definir Nombre de la Sociedad",
              descripcion:
                "Verifique la disponibilidad del nombre de la sociedad en el Registro Público o entidad correspondiente.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Consultar la disponibilidad del nombre",
                  detalle: [
                    "Acceda al sitio web del Registro Público o acuda personalmente a sus oficinas.",
                    "Realice una búsqueda para asegurarse de que el nombre deseado no esté ya registrado por otra entidad.",
                    "Considere varias opciones de nombre en caso de que el primero no esté disponible.",
                  ],
                  caveats: [
                    "El nombre elegido no debe ser idéntico o similar a otro ya registrado para evitar conflictos legales (Artículo 1196, Código Civil)【36†source】.",
                  ],
                },
                {
                  subpaso: "Reservar el nombre de la sociedad",
                  detalle: [
                    "Complete el formulario de solicitud de reserva de nombre, si está disponible.",
                    "Pague la tarifa correspondiente para la reserva del nombre.",
                    "Obtenga el certificado de reserva de nombre, que tendrá una vigencia limitada.",
                  ],
                  caveats: [
                    "La reserva del nombre suele tener una validez temporal; es importante continuar con los trámites dentro de ese periodo.",
                  ],
                },
              ],
            },
            {
              paso: "Redactar el Contrato Social",
              descripcion:
                "Elabore el contrato social que establece las bases legales y operativas de la sociedad civil.",
              documentos: ["Contrato Social", "Identificaciones de los socios"],
              subpasos: [
                {
                  subpaso: "Contratar a un abogado especializado",
                  detalle: [
                    "Busque un abogado con experiencia en derecho civil y societario.",
                    "Programe una reunión para discutir los términos y condiciones del contrato social.",
                    "Proporcione al abogado la información necesaria sobre los socios y la sociedad.",
                  ],
                  caveats: [
                    "Un abogado especializado garantizará que el contrato cumpla con todas las disposiciones legales.",
                  ],
                },
                {
                  subpaso: "Incluir cláusulas esenciales en el contrato",
                  detalle: [
                    "Detallar el objeto social o actividad principal de la sociedad (debe ser una actividad no comercial según los artículos 5 y 17 del Código de Comercio)【36†source】.",
                    "Especificar las aportaciones de cada socio, ya sean en dinero, bienes o servicios.",
                    "Establecer la forma de administración y representación de la sociedad.",
                    "Definir la distribución de utilidades y pérdidas entre los socios (Artículo 1196, Código Civil)【36†source】.",
                    "Incluir cláusulas sobre la disolución y liquidación de la sociedad (Artículo 1196, Código Civil)【36†source】.",
                  ],
                  caveats: [
                    "Es fundamental que todas las cláusulas sean claras para evitar malentendidos futuros entre los socios.",
                  ],
                },
                {
                  subpaso: "Firmar el contrato social ante notario",
                  detalle: [
                    "Coordinar una cita en una notaría pública con todos los socios presentes.",
                    "Presentar las identificaciones oficiales de cada socio.",
                    "Firmar el contrato social en presencia del notario, quien dará fe de las firmas.",
                    "Solicitar copias certificadas del contrato para cada socio y para trámites posteriores.",
                  ],
                  caveats: [
                    "La protocolización del contrato ante notario es necesaria para otorgarle validez legal (Artículo 1196, Código Civil)【36†source】.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Público",
              descripcion:
                "Registre el contrato social en el Registro Público de Comercio o entidad equivalente para obtener personalidad jurídica.",
              documentos: [
                "Contrato Social protocolizado",
                "Solicitud de inscripción",
                "Comprobantes de pago de derechos registrales",
              ],
              subpasos: [
                {
                  subpaso: "Preparar la documentación para el registro",
                  detalle: [
                    "Obtener el contrato social protocolizado y las copias certificadas necesarias.",
                    "Completar la solicitud de inscripción proporcionada por el Registro Público.",
                    "Reunir los comprobantes de pago de las tasas o derechos correspondientes.",
                  ],
                  caveats: [
                    "Verificar que toda la documentación esté completa y correctamente elaborada para evitar rechazos o retrasos.",
                  ],
                },
                {
                  subpaso: "Presentar la solicitud en el Registro Público",
                  detalle: [
                    "Acudir al Registro Público de Comercio con toda la documentación.",
                    "Presentar la solicitud y entregar los documentos al registrador.",
                    "Recibir el acuse de recibo o comprobante de trámite.",
                  ],
                  caveats: [
                    "Los tiempos de registro pueden variar; es recomendable consultar los plazos estimados.",
                  ],
                },
                {
                  subpaso: "Obtener el folio mercantil",
                  detalle: [
                    "Una vez aprobada la inscripción, obtener el número de folio mercantil asignado a la sociedad.",
                    "Solicitar una certificación del registro si es necesario para trámites posteriores.",
                  ],
                  caveats: [
                    "El folio mercantil es esencial para identificar legalmente a la sociedad en operaciones futuras.",
                  ],
                },
              ],
            },
            {
              paso: "Registro ante la Autoridad Fiscal",
              descripcion:
                "Inscriba la sociedad civil en el Registro Federal de Contribuyentes (RFC) para cumplir con las obligaciones fiscales.",
              documentos: [
                "Formato de inscripción al RFC",
                "Acta constitutiva o contrato social registrado",
                "Identificación oficial del representante legal",
                "Comprobante de domicilio fiscal",
              ],
              subpasos: [
                {
                  subpaso: "Preparar la solicitud de inscripción",
                  detalle: [
                    "Acceder al portal del Servicio de Administración Tributaria (SAT) o acudir a una oficina local.",
                    "Completar el formulario de inscripción al RFC con los datos de la sociedad.",
                    "Reunir los documentos requeridos, incluyendo el contrato social y comprobantes de domicilio.",
                  ],
                  caveats: [
                    "Es importante que el domicilio fiscal sea válido y esté actualizado.",
                  ],
                },
                {
                  subpaso: "Presentar la solicitud y obtener el RFC",
                  detalle: [
                    "Entregar la documentación en la oficina del SAT o seguir el proceso en línea.",
                    "Esperar la validación de los datos y la emisión del RFC.",
                    "Imprimir o solicitar la constancia de inscripción al RFC.",
                  ],
                  caveats: [
                    "El RFC es indispensable para facturar y cumplir con obligaciones fiscales.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abra una cuenta bancaria a nombre de la sociedad civil para manejar sus operaciones financieras.",
              documentos: [
                "Contrato social registrado",
                "Constancia de inscripción al RFC",
                "Identificación oficial del representante legal",
                "Comprobante de domicilio",
              ],
              subpasos: [
                {
                  subpaso: "Seleccionar la institución bancaria",
                  detalle: [
                    "Investigar y comparar las ofertas de distintos bancos para cuentas empresariales.",
                    "Considerar factores como comisiones, servicios adicionales y requisitos de saldo mínimo.",
                  ],
                  caveats: [
                    "Elegir un banco que se ajuste a las necesidades financieras de la sociedad.",
                  ],
                },
                {
                  subpaso: "Reunir los documentos requeridos",
                  detalle: [
                    "Contactar al banco elegido para obtener una lista detallada de los documentos necesarios.",
                    "Asegurarse de que todos los documentos estén actualizados y en buen estado.",
                  ],
                },
                {
                  subpaso: "Proceder con la apertura de la cuenta",
                  detalle: [
                    "Acudir a la sucursal bancaria con toda la documentación.",
                    "Completar los formularios proporcionados por el banco.",
                    "Proporcionar información sobre la actividad y operaciones de la sociedad.",
                    "Depositar el monto mínimo de apertura, si se requiere.",
                  ],
                  caveats: [
                    "Leer y entender todos los términos y condiciones antes de firmar.",
                  ],
                },
              ],
            },
            {
              paso: "Obtención de Permisos y Licencias (si aplica)",
              descripcion:
                "Gestionar los permisos y licencias necesarios según la actividad económica de la sociedad.",
              documentos: [
                "Licencia municipal de funcionamiento",
                "Permisos sectoriales específicos",
                "Certificados ambientales o sanitarios",
              ],
              subpasos: [
                {
                  subpaso: "Identificar los requisitos legales",
                  detalle: [
                    "Determinar si la actividad de la sociedad requiere permisos especiales.",
                    "Consultar con autoridades municipales, estatales o federales según corresponda.",
                  ],
                  caveats: [
                    "Operar sin los permisos adecuados puede resultar en sanciones o clausuras.",
                  ],
                },
                {
                  subpaso: "Tramitar los permisos necesarios",
                  detalle: [
                    "Reunir la documentación solicitada por cada entidad reguladora.",
                    "Completar y presentar las solicitudes correspondientes.",
                    "Pagar las tarifas o derechos asociados a cada permiso.",
                  ],
                  caveats: [
                    "Algunos permisos pueden tardar en emitirse; es recomendable iniciar los trámites con anticipación.",
                  ],
                },
                {
                  subpaso: "Cumplir con inspecciones o requisitos adicionales",
                  detalle: [
                    "Facilitar las inspecciones que puedan requerir las autoridades.",
                    "Implementar medidas correctivas si se señalan observaciones.",
                  ],
                  caveats: [
                    "El incumplimiento de requisitos puede impedir la obtención de los permisos.",
                  ],
                },
              ],
            },
            {
              paso: "Registro ante la Seguridad Social (si aplica)",
              descripcion:
                "Inscriba a la sociedad y a sus empleados en el Instituto Mexicano del Seguro Social (IMSS) u organismo equivalente.",
              documentos: [
                "Formato de inscripción patronal",
                "Contrato social",
                "RFC de la sociedad",
                "Identificación del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Realizar la inscripción patronal",
                  detalle: [
                    "Acudir a la oficina del IMSS correspondiente al domicilio fiscal.",
                    "Completar el formato de inscripción patronal con los datos de la sociedad.",
                    "Presentar los documentos requeridos.",
                  ],
                  caveats: [
                    "La inscripción es obligatoria si la sociedad cuenta con empleados.",
                  ],
                },
                {
                  subpaso: "Registrar a los empleados",
                  detalle: [
                    "Obtener los datos personales y documentación de los empleados.",
                    "Dar de alta a cada empleado en el sistema del IMSS.",
                    "Calcular y pagar las cuotas obrero-patronales mensualmente.",
                  ],
                  caveats: [
                    "El incumplimiento en el pago de cuotas puede generar recargos y sanciones.",
                  ],
                },
              ],
            },
            {
              paso: "Cumplimiento de Obligaciones Legales y Fiscales",
              descripcion:
                "Mantener al día las obligaciones legales, fiscales y laborales para el correcto funcionamiento de la sociedad.",
              documentos: [
                "Declaraciones de impuestos",
                "Pagos de cuotas al IMSS",
                "Renovación de permisos y licencias",
                "Libros corporativos actualizados",
              ],
              subpasos: [
                {
                  subpaso: "Presentar declaraciones fiscales periódicas",
                  detalle: [
                    "Elaborar y presentar las declaraciones mensuales, trimestrales o anuales según corresponda.",
                    "Pagar oportunamente los impuestos determinados.",
                  ],
                  caveats: [
                    "Las omisiones o retrasos pueden generar multas y recargos.",
                  ],
                },
                {
                  subpaso: "Actualizar libros y registros corporativos",
                  detalle: [
                    "Mantener al día el libro de actas de asambleas y decisiones de socios.",
                    "Registrar los cambios en la estructura de la sociedad o en las aportaciones de los socios.",
                  ],
                  caveats: [
                    "Los libros corporativos son documentos legales que pueden ser requeridos en auditorías o litigios.",
                  ],
                },
                {
                  subpaso: "Renovar permisos y licencias",
                  detalle: [
                    "Verificar las fechas de vigencia de cada permiso o licencia.",
                    "Iniciar los trámites de renovación con anticipación.",
                    "Cumplir con nuevos requisitos que puedan establecer las autoridades.",
                  ],
                  caveats: [
                    "La operación sin permisos vigentes puede resultar en sanciones.",
                  ],
                },
                {
                  subpaso: "Cumplir con obligaciones laborales",
                  detalle: [
                    "Pagar salarios y prestaciones conforme a la ley.",
                    "Respetar los derechos laborales y las condiciones establecidas en los contratos.",
                    "Llevar registros de asistencia, vacaciones y otros aspectos laborales.",
                  ],
                  caveats: [
                    "El incumplimiento de obligaciones laborales puede derivar en demandas o sanciones.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sucursal de Sociedad Extranjera",
          descripcion:
            "Una empresa de tipo Sucursal de Sociedad Extranjera es una extensión de una empresa extranjera que opera en otro país. Es una entidad jurídica que depende de una sociedad matriz situada en otro país y que tiene como objetivo llevar a cabo actividades comerciales, operativas o administrativas en un territorio diferente al de origen. Aunque la sucursal está registrada y opera en Costa Rica, sigue siendo parte de la sociedad matriz, sin constituir una nueva persona jurídica separada. Según el artículo 19 del Código de Comercio, las sucursales deben registrarse en el país y cumplir con las leyes locales para realizar actividades comerciales.",
          pasos: [
            {
              paso: "Legalizar Documentos de la Sociedad Matriz",
              descripcion:
                "Obtener y legalizar los documentos necesarios de la sociedad extranjera en el país de origen.",
              documentos: [
                "Certificado de existencia legal de la sociedad matriz",
                "Estatutos de la sociedad matriz",
                "Acta de acuerdo para establecer la sucursal",
              ],
              subpasos: [
                {
                  subpaso: "Obtener documentos oficiales de la sociedad matriz",
                  detalle: [
                    "Solicitar al Registro Mercantil o equivalente en el país de origen el certificado de existencia legal.",
                    "Obtener copias certificadas de los estatutos y el acta donde se acuerda la apertura de la sucursal en Costa Rica.",
                  ],
                  caveats: [
                    "Los documentos deben ser recientes, generalmente con una antigüedad no mayor a tres meses.",
                  ],
                },
                {
                  subpaso: "Apostillar o legalizar los documentos",
                  detalle: [
                    "Si el país de origen es miembro del Convenio de La Haya, apostillar los documentos.",
                    "Si no, legalizar los documentos en el consulado de Costa Rica en el país de origen y luego en el Ministerio de Relaciones Exteriores en Costa Rica.",
                  ],
                  caveats: [
                    "Los documentos deben estar apostillados o legalizados para tener validez legal en Costa Rica.",
                  ],
                },
                {
                  subpaso: "Traducir los documentos al español",
                  detalle: [
                    "Contratar a un traductor oficial en Costa Rica para traducir los documentos al español.",
                    "Asegurarse de que el traductor esté autorizado por el Ministerio de Relaciones Exteriores de Costa Rica.",
                  ],
                  caveats: [
                    "La traducción oficial es necesaria para todos los documentos que no estén en español.",
                  ],
                },
              ],
            },
            {
              paso: "Nombrar Representante Legal en Costa Rica",
              descripcion:
                "Designar un representante legal para la sucursal en Costa Rica.",
              documentos: [
                "Poder de representación",
                "Copia de identificación del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Redactar el poder de representación",
                  detalle: [
                    "La sociedad matriz debe otorgar un poder especial al representante legal en Costa Rica.",
                    "El poder debe especificar las facultades y responsabilidades del representante.",
                  ],
                  caveats: [
                    "El poder debe ser amplio para permitir al representante cumplir con todas las obligaciones legales.",
                  ],
                },
                {
                  subpaso: "Legalizar y traducir el poder",
                  detalle: [
                    "Apostillar o legalizar el poder de representación, siguiendo los mismos pasos que con los demás documentos.",
                    "Traducir oficialmente el poder al español si está en otro idioma.",
                  ],
                  caveats: [
                    "El poder debe cumplir con los requisitos de legalización y traducción para ser válido en Costa Rica.",
                  ],
                },
                {
                  subpaso: "Obtener identificación del representante",
                  detalle: [
                    "El representante legal debe tener cédula de identidad costarricense o DIMEX si es extranjero residente.",
                    "Proporcionar copias certificadas de la identificación.",
                  ],
                  caveats: [
                    "El representante legal debe estar legalmente autorizado para residir y trabajar en Costa Rica.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar Escritura Pública de Constitución de la Sucursal",
              descripcion:
                "Redactar la escritura pública que formaliza la creación de la sucursal en Costa Rica.",
              documentos: [
                "Escritura pública de constitución",
                "Documentos legalizados y traducidos de la sociedad matriz",
              ],
              subpasos: [
                {
                  subpaso: "Contratar a un notario público costarricense",
                  detalle: [
                    "Seleccionar un notario con experiencia en derecho corporativo internacional.",
                    "Proporcionar al notario todos los documentos legalizados y traducidos.",
                  ],
                  caveats: [
                    "Es obligatorio que la escritura pública sea otorgada ante notario en Costa Rica.",
                  ],
                },
                {
                  subpaso: "Redacción y firma de la escritura",
                  detalle: [
                    "El notario redactará la escritura pública de constitución de la sucursal.",
                    "El representante legal firmará la escritura ante el notario.",
                  ],
                  caveats: [
                    "Verificar que todos los datos estén correctos antes de firmar la escritura.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registrar la sucursal en el Registro de Personas Jurídicas del Registro Nacional de Costa Rica.",
              documentos: [
                "Escritura pública de constitución",
                "Formulario de inscripción",
                "Recibos de pago de tasas",
              ],
              subpasos: [
                {
                  subpaso: "Presentar la escritura en el Registro Nacional",
                  detalle: [
                    "El notario o el representante legal presentarán la escritura de constitución en el Registro Nacional.",
                    "Completar y presentar el formulario de inscripción correspondiente.",
                  ],
                  caveats: [
                    "El registro es esencial para que la sucursal tenga personalidad jurídica en Costa Rica.",
                  ],
                },
                {
                  subpaso: "Pagar las tasas registrales",
                  detalle: [
                    "Pagar los derechos de registro y timbres fiscales requeridos.",
                    "Conservar los comprobantes de pago.",
                  ],
                  caveats: [
                    "Los pagos deben realizarse puntualmente para evitar retrasos en el registro.",
                  ],
                },
                {
                  subpaso: "Obtener la cédula jurídica",
                  detalle: [
                    "Una vez inscrita, el Registro Nacional emitirá una cédula jurídica para la sucursal.",
                    "Esta cédula es necesaria para todos los trámites legales y fiscales.",
                  ],
                },
              ],
            },
            {
              paso: "Registro Tributario",
              descripcion:
                "Registrar la sucursal ante el Ministerio de Hacienda y obtener el Número de Identificación Tributaria (NIT).",
              documentos: [
                "Cédula jurídica",
                "Formulario D-140",
                "Identificación del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Completar el formulario D-140",
                  detalle: [
                    "Acceder al portal de Administración Tributaria Virtual (ATV).",
                    "Completar el formulario con los datos de la sucursal y el representante legal.",
                  ],
                  caveats: [
                    "Es importante que la información proporcionada sea precisa y completa.",
                  ],
                },
                {
                  subpaso: "Presentar documentación en el Ministerio de Hacienda",
                  detalle: [
                    "Adjuntar los documentos requeridos, incluyendo la cédula jurídica y la identificación del representante legal.",
                    "Presentar el formulario y documentos en la oficina tributaria correspondiente o en línea si es posible.",
                  ],
                  caveats: [
                    "Sin el NIT, la sucursal no puede operar legalmente ni cumplir con sus obligaciones tributarias.",
                  ],
                },
                {
                  subpaso: "Obtener el NIT",
                  detalle: [
                    "Una vez aprobado el registro, el Ministerio de Hacienda emitirá el NIT para la sucursal.",
                    "Este número se usará para todas las obligaciones fiscales.",
                  ],
                },
              ],
            },
            {
              paso: "Registro ante la CCSS y otras instituciones",
              descripcion:
                "Registrar la sucursal ante la Caja Costarricense de Seguro Social y otras entidades si corresponde.",
              documentos: [
                "Cédula jurídica",
                "Identificación del representante legal",
                "Formulario de inscripción en la CCSS",
              ],
              subpasos: [
                {
                  subpaso: "Inscripción en la CCSS",
                  detalle: [
                    "Presentar el formulario de inscripción en la oficina de la CCSS correspondiente.",
                    "Proporcionar la información requerida sobre la sucursal y el personal empleado.",
                  ],
                  caveats: [
                    "Es obligatorio para empleadores inscribir a sus trabajadores en la CCSS.",
                  ],
                },
                {
                  subpaso: "Registro en otras instituciones",
                  detalle: [
                    "Si corresponde, registrar la sucursal en el Instituto Nacional de Seguros (INS) para pólizas de riesgos laborales.",
                    "Considerar registros adicionales según el sector de actividad (por ejemplo, permisos sanitarios, municipales).",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abrir una cuenta bancaria a nombre de la sucursal para operaciones financieras.",
              documentos: [
                "Cédula jurídica",
                "Identificación del representante legal",
                "Escritura pública de constitución",
              ],
              subpasos: [
                {
                  subpaso: "Seleccionar una entidad bancaria",
                  detalle: [
                    "Investigar opciones bancarias y elegir la que mejor se adapte a las necesidades de la sucursal.",
                    "Contactar al banco para conocer los requisitos específicos.",
                  ],
                  caveats: [
                    "Algunos bancos pueden tener políticas especiales para sucursales de sociedades extranjeras.",
                  ],
                },
                {
                  subpaso: "Presentar documentos y abrir la cuenta",
                  detalle: [
                    "Proporcionar al banco todos los documentos solicitados.",
                    "Completar los formularios de apertura de cuenta.",
                  ],
                  caveats: [
                    "El proceso puede tomar más tiempo que para personas físicas o sociedades locales.",
                  ],
                },
              ],
            },
            {
              paso: "Obtención de Permisos y Licencias",
              descripcion:
                "Obtener los permisos y licencias necesarios para operar según la actividad de la sucursal.",
              documentos: [
                "Permiso municipal",
                "Permiso sanitario",
                "Otros según actividad",
              ],
              subpasos: [
                {
                  subpaso: "Solicitar permiso municipal",
                  detalle: [
                    "Dirigirse a la municipalidad donde operará la sucursal.",
                    "Presentar los documentos requeridos y completar los formularios.",
                  ],
                  caveats: ["Los requisitos pueden variar según la municipalidad."],
                },
                {
                  subpaso: "Obtener permiso sanitario",
                  detalle: [
                    "Solicitar el permiso al Ministerio de Salud si la actividad lo requiere.",
                    "Cumplir con las inspecciones y requisitos establecidos.",
                  ],
                  caveats: [
                    "Es esencial para actividades que involucren alimentos, salud, etc.",
                  ],
                },
                {
                  subpaso: "Tramitar otros permisos",
                  detalle: [
                    "Identificar si se requieren permisos adicionales según el sector (por ejemplo, SUGEF, SETENA).",
                    "Completar los trámites correspondientes.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Sucursal Activa",
              descripcion:
                "Cumplir con obligaciones fiscales y legales para mantener la sucursal en funcionamiento.",
              documentos: [
                "Declaraciones tributarias",
                "Pago de cargas sociales",
                "Renovación de permisos",
              ],
              subpasos: [
                {
                  subpaso: "Presentar declaraciones tributarias",
                  detalle: [
                    "Realizar declaraciones de impuestos mensuales y anuales según corresponda.",
                    "Utilizar el NIT para ingresar al sistema de ATV.",
                  ],
                  caveats: [
                    "El incumplimiento puede resultar en multas y sanciones legales.",
                  ],
                },
                {
                  subpaso: "Pagar cargas sociales",
                  detalle: [
                    "Calcular y pagar mensualmente las cargas sociales a la CCSS.",
                    "Mantener al día los pagos para evitar intereses y sanciones.",
                  ],
                },
                {
                  subpaso: "Renovar permisos y licencias",
                  detalle: [
                    "Verificar fechas de vencimiento de permisos municipales y sanitarios.",
                    "Realizar las renovaciones en tiempo y forma.",
                  ],
                },
                {
                  subpaso: "Preparar estados financieros",
                  detalle: [
                    "Contratar a un contador público autorizado para preparar estados financieros.",
                    "Presentar los informes requeridos al Ministerio de Hacienda y otras autoridades.",
                  ],
                  caveats: [
                    "La transparencia financiera es crucial para cumplir con regulaciones y mantener la confianza de las autoridades.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Asociación Deportiva",
          descripcion:
            "Una Asociación Deportiva es una entidad de carácter no lucrativo enfocada en actividades deportivas, cuya finalidad es promover, organizar y desarrollar actividades relacionadas con el deporte. Las asociaciones deportivas están reguladas por leyes específicas y deben cumplir con ciertos requisitos para su constitución y operación. Están constituidas por miembros que buscan objetivos comunes relacionados con la práctica y promoción del deporte (Artículo 3 de la Constitución de Asociación Deportiva)【33†source】.",
          pasos: [
            {
              paso: "Definir el Nombre y Domicilio de la Asociación",
              descripcion:
                "Determine el nombre y domicilio de la asociación, asegurando que el nombre no esté registrado por otra organización y cumpliendo con los requisitos legales.",
              documentos: ["Certificación de disponibilidad de nombre"],
              subpasos: [
                {
                  subpaso: "Verificar la disponibilidad del nombre",
                  detalle: [
                    "Acceda al sitio web del Registro Nacional para verificar la disponibilidad del nombre propuesto para la asociación.",
                    "Asegúrese de que el nombre deseado no esté registrado por otra entidad: intente varias alternativas si el nombre está tomado.",
                    "Obtenga la certificación de disponibilidad de nombre para respaldar el proceso de registro.",
                  ],
                  caveats: [
                    "El nombre de la asociación no debe ser igual o similar a uno ya registrado, para evitar problemas legales o de confusión en el mercado (Artículo 2 de la Constitución de Asociación Deportiva)【33†source】.",
                  ],
                },
                {
                  subpaso: "Determinar el domicilio de la asociación",
                  detalle: [
                    "Establezca la dirección oficial de la asociación dentro de Costa Rica, incluyendo la provincia, el cantón y el distrito (Artículo 2 de la Constitución de Asociación Deportiva)【33†source】.",
                    "Esta dirección será utilizada para recibir notificaciones legales y administrativas.",
                  ],
                },
              ],
            },
            {
              paso: "Definir los Objetivos y Actividades",
              descripcion:
                "Especifique los objetivos principales de la asociación, asegurando que sean de carácter deportivo y no lucrativo.",
              documentos: ["Documento de objetivos y actividades"],
              subpasos: [
                {
                  subpaso: "Definir los objetivos de la asociación",
                  detalle: [
                    "Establezca los objetivos principales de la asociación, asegurándose de que sean congruentes con el propósito deportivo y no lucrativo.",
                    "Los objetivos deben enfatizar la promoción y desarrollo del deporte entre sus miembros y la comunidad (Artículo 3 de la Constitución de Asociación Deportiva)【33†source】.",
                  ],
                  caveats: [
                    "Los objetivos de la asociación deben estar alineados con su naturaleza no lucrativa, para evitar conflictos legales o fiscales.",
                  ],
                },
                {
                  subpaso: "Determinar las actividades permitidas",
                  detalle: [
                    "Defina las actividades que llevará a cabo la asociación para cumplir sus objetivos, como organización de eventos deportivos, recaudación de fondos y adquisición de equipos (Artículo 4 de la Constitución de Asociación Deportiva)【33†source】.",
                    "Las actividades deben ser compatibles con la naturaleza de la asociación y contribuir al cumplimiento de sus fines.",
                  ],
                },
              ],
            },
            {
              paso: "Elaborar el Acta Constitutiva",
              descripcion:
                "Prepare el acta constitutiva con la asistencia de un abogado, la cual debe incluir la información sobre los miembros fundadores, los objetivos y el capital inicial.",
              documentos: [
                "Acta Constitutiva",
                "Identificación de los miembros fundadores",
              ],
              subpasos: [
                {
                  subpaso:
                    "Contratar a un abogado para la redacción del acta constitutiva",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo y asociaciones sin fines de lucro.",
                    "Programe una reunión para discutir los detalles de la asociación, incluyendo sus objetivos, los miembros fundadores y sus roles.",
                  ],
                  caveats: [
                    "La asesoría legal es esencial para garantizar que el acta constitutiva cumpla con todas las regulaciones aplicables (Artículo 2 de la Constitución de Asociación Deportiva)【33†source】.",
                  ],
                },
                {
                  subpaso: "Incluir la clasificación de los miembros",
                  detalle: [
                    "Identifique a los diferentes tipos de miembros de la asociación, incluyendo miembros fundadores, activos y honorarios (Artículo 6 de la Constitución de Asociación Deportiva)【33†source】.",
                    "Especifique los derechos y obligaciones de cada tipo de miembro, como el derecho a voto y la participación en actividades.",
                  ],
                  caveats: [
                    "La clasificación de los miembros debe ser clara para evitar conflictos en la gestión de la asociación.",
                  ],
                },
                {
                  subpaso: "Firme el acta constitutiva ante notario",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar el acta constitutiva.",
                    "Asegúrese de que todos los miembros fundadores presenten sus identificaciones vigentes y estén presentes para la firma.",
                    "El notario dará fe de la autenticidad de las firmas y la validez del documento: solicite copias certificadas para cada miembro.",
                  ],
                  caveats: [
                    "La firma ante notario es obligatoria para que el acta tenga validez legal (Artículo 7 de la Constitución de Asociación Deportiva)【33†source】.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la asociación deportiva en el Registro Nacional para obtener su personalidad jurídica.",
              documentos: [
                "Acta Constitutiva autenticada",
                "Certificación de disponibilidad de nombre",
                "Identificación de los miembros",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción",
                  detalle: [
                    "Obtenga el formulario de inscripción en el Registro Nacional o descárguelo de su sitio web.",
                    "Complete toda la información requerida sobre la asociación y los miembros fundadores.",
                    "Adjunte los documentos necesarios, incluyendo el acta autenticada y la certificación de nombre.",
                  ],
                  caveats: [
                    "La omisión de información o documentos puede retrasar el proceso de inscripción.",
                  ],
                },
                {
                  subpaso: "Presentar la documentación en el Registro Nacional",
                  detalle: [
                    "Entregue todos los documentos en la oficina del Registro Nacional.",
                    "Pague las tarifas correspondientes al registro de la asociación y guarde el comprobante de pago.",
                    "Espere la revisión y aprobación de la documentación: el Registro Nacional notificará si hay observaciones o si se requiere información adicional.",
                  ],
                  caveats: [
                    "El registro no será efectivo hasta que se completen todos los requisitos y se realicen los pagos correspondientes.",
                  ],
                },
                {
                  subpaso: "Obtenga la personería jurídica",
                  detalle: [
                    "Una vez inscrita, solicite una copia de la personería jurídica de la asociación.",
                    "Guarde este documento en un lugar seguro: es necesario para realizar trámites legales y financieros.",
                    "Utilice la personería jurídica para abrir cuentas bancarias y gestionar otros asuntos en nombre de la asociación.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción Tributaria",
              descripcion:
                "Registre la asociación como contribuyente ante el Ministerio de Hacienda y obtenga el Número de Identificación Tributaria (NIT).",
              documentos: [
                "Formulario D-140",
                "Documento de identidad del representante legal",
                "Personería jurídica",
              ],
              subpasos: [
                {
                  subpaso: "Registro en el Ministerio de Hacienda",
                  detalle: [
                    "Acceda al portal ATV del Ministerio de Hacienda y complete el formulario D-140 con los datos de la asociación.",
                    "Adjunte los documentos requeridos: personería jurídica y cédula del representante legal.",
                    "Espere la confirmación del registro y obtenga el NIT para trámites tributarios.",
                  ],
                  caveats: [
                    "El NIT es indispensable para cualquier actividad tributaria de la asociación.",
                  ],
                },
              ],
            },
            {
              paso: "Apertura de Cuenta Bancaria",
              descripcion:
                "Abra una cuenta bancaria a nombre de la asociación para manejar sus operaciones financieras.",
              documentos: [
                "Acta Constitutiva",
                "Personería jurídica",
                "Cédula del representante legal",
              ],
              subpasos: [
                {
                  subpaso: "Seleccionar el Banco",
                  detalle: [
                    "Investigue las opciones bancarias disponibles que ofrezcan cuentas para asociaciones sin fines de lucro.",
                    "Compare tarifas, requisitos y servicios adicionales que puedan ser beneficiosos para la asociación.",
                    "Seleccione el banco que mejor se adapte a las necesidades de la asociación.",
                  ],
                },
                {
                  subpaso: "Apertura de la Cuenta",
                  detalle: [
                    "Contacte al banco y programe una cita para abrir la cuenta de la asociación.",
                    "Presente todos los documentos requeridos: acta constitutiva, personería jurídica y cédula del representante legal.",
                    "Complete los formularios proporcionados por el banco y realice el depósito inicial si es necesario.",
                  ],
                  caveats: [
                    "Asegúrese de entender las condiciones y obligaciones asociadas con la cuenta bancaria de la asociación.",
                  ],
                },
              ],
            },
            {
              paso: "Obtención de Permisos y Licencias",
              descripcion:
                "Gestione los permisos y licencias necesarios para operar legalmente.",
              documentos: [
                "Permiso de funcionamiento del Ministerio de Salud",
                "Patente municipal",
                "Inscripción en la Caja Costarricense de Seguro Social (CCSS)",
              ],
              subpasos: [
                {
                  subpaso: "Permiso del Ministerio de Salud",
                  detalle: [
                    "Complete el formulario de solicitud de permiso de funcionamiento: disponible en el sitio web del Ministerio de Salud.",
                    "Adjunte los documentos requeridos: planos del local, certificaciones, etc.",
                    "Presente la solicitud en la oficina regional correspondiente y pague las tasas aplicables.",
                  ],
                  caveats: [
                    "El permiso es obligatorio para actividades que puedan afectar la salud pública.",
                  ],
                },
                {
                  subpaso: "Obtención de la Patente Municipal",
                  detalle: [
                    "Visite la municipalidad donde operará la asociación para solicitar la patente.",
                    "Complete el formulario de solicitud y adjunte los documentos necesarios: permiso del Ministerio de Salud, personería jurídica, etc.",
                    "Pague las tarifas correspondientes y espere la aprobación de la patente.",
                  ],
                  caveats: [
                    "Operar sin patente municipal puede resultar en sanciones y cierre del establecimiento.",
                  ],
                },
                {
                  subpaso: "Inscripción en la CCSS",
                  detalle: [
                    "Registre la asociación en la CCSS para cumplir con las obligaciones laborales y sociales.",
                    "Complete el formulario de inscripción y presente la documentación requerida: personería jurídica, cédulas de los miembros del consejo directivo, etc.",
                    "Obtenga el número de patrono y mantenga al día los pagos de cargas sociales.",
                  ],
                  caveats: [
                    "El incumplimiento con la CCSS puede generar multas y afectar la reputación de la asociación.",
                  ],
                },
              ],
            },
            {
              paso: "Mantener la Asociación Activa",
              descripcion:
                "Realice las gestiones necesarias para mantener la asociación activa y en cumplimiento de sus obligaciones legales y fiscales.",
              documentos: [
                "Certificados de cumplimiento tributario",
                "Comprobante de pagos de la Caja Costarricense de Seguro Social (CCSS)",
              ],
              subpasos: [
                {
                  subpaso: "Declaraciones Tributarias Mensuales",
                  detalle: [
                    "Visite el portal de ATV del Ministerio de Hacienda para presentar la declaración de impuestos: asegúrese de utilizar su número de cédula y contraseña para ingresar.",
                    "Complete la declaración con los ingresos y gastos del mes: asegúrese de tener todos los recibos y facturas organizados para facilitar este proceso.",
                    "Pague el impuesto correspondiente antes de la fecha límite (generalmente el último día del mes): puede realizar el pago a través de transferencia bancaria o en cualquier banco autorizado.",
                  ],
                },
                {
                  subpaso: "Pago de la Caja Costarricense de Seguro Social (CCSS)",
                  detalle: [
                    "Calcule las cargas sociales que debe pagar cada mes en base a los salarios pagados: este cálculo puede hacerlo a través del sistema en línea de la CCSS.",
                    "Visite el portal de la CCSS o un banco autorizado para realizar el pago de las cargas sociales: el pago debe hacerse antes del día 15 de cada mes.",
                    "Guarde el comprobante de pago como respaldo para futuras auditorías o revisiones.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento del Permiso Sanitario y la patente municipal: estos permisos generalmente se deben renovar anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para presentar los documentos requeridos para la renovación: incluya una copia del permiso anterior y un comprobante de pago de impuestos municipales.",
                    "Pague las tarifas correspondientes y espere la aprobación de la renovación: asegúrese de guardar los comprobantes de pago y las nuevas licencias.",
                  ],
                  caveats: [
                    "Si no se renuevan los permisos a tiempo, la empresa podría enfrentar sanciones o incluso el cierre temporal.",
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    /* src\ShaderToy.svelte generated by Svelte v3.59.2 */

    const { console: console_1 } = globals;
    const file$1 = "src\\ShaderToy.svelte";

    function create_fragment$1(ctx) {
    	let canvas_1;

    	const block = {
    		c: function create() {
    			canvas_1 = element("canvas");
    			attr_dev(canvas_1, "class", "svelte-57y0h8");
    			add_location(canvas_1, file$1, 264, 0, 7538);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, canvas_1, anchor);
    			/*canvas_1_binding*/ ctx[8](canvas_1);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(canvas_1);
    			/*canvas_1_binding*/ ctx[8](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function loadTexture(gl, url, unit) {
    	const texture = gl.createTexture();
    	gl.activeTexture(gl.TEXTURE0 + unit);
    	gl.bindTexture(gl.TEXTURE_2D, texture);

    	// Placeholder while the image loads
    	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    	const image = new Image();

    	// Set crossOrigin only if the URL is absolute
    	if (url.startsWith("http://") || url.startsWith("https://")) {
    		image.crossOrigin = "anonymous";
    	}

    	image.onload = function () {
    		gl.activeTexture(gl.TEXTURE0 + unit);
    		gl.bindTexture(gl.TEXTURE_2D, texture);
    		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    		gl.generateMipmap(gl.TEXTURE_2D);
    	};

    	image.src = url;
    	return texture;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ShaderToy', slots, []);
    	let { shader } = $$props;

    	// Built-in uniforms
    	let canvas;

    	let gl;
    	let program;
    	let animationFrameId;
    	let startTime = Date.now();
    	let mouseDown = false;

    	let { iResolution = {
    		x: window.innerWidth,
    		y: window.innerHeight
    	} } = $$props;

    	let { iMouse = { x: 0, y: 0, z: 0, w: 0 } } = $$props;
    	let { iChannel0 = null } = $$props;
    	let { iChannel1 = null } = $$props;
    	let { iChannel2 = null } = $$props;
    	let { iChannel3 = null } = $$props;

    	// Handle mouse events
    	function handleMouseMove(event) {
    		const rect = canvas.getBoundingClientRect();
    		$$invalidate(2, iMouse.x = event.clientX - rect.left, iMouse);
    		$$invalidate(2, iMouse.y = rect.height - (event.clientY - rect.top), iMouse);

    		if (mouseDown) {
    			$$invalidate(2, iMouse.z = iMouse.x, iMouse);
    			$$invalidate(2, iMouse.w = iMouse.y, iMouse);
    		}
    	}

    	function handleMouseDown(event) {
    		mouseDown = true;
    		handleMouseMove(event);
    	}

    	function handleMouseUp(event) {
    		mouseDown = false;
    	}

    	// Handle window resize
    	function handleResize() {
    		$$invalidate(1, iResolution.x = window.innerWidth, iResolution);
    		$$invalidate(1, iResolution.y = window.innerHeight, iResolution);
    		$$invalidate(0, canvas.width = iResolution.x, canvas);
    		$$invalidate(0, canvas.height = iResolution.y, canvas);

    		if (gl) {
    			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    		}
    	}

    	onMount(() => {
    		gl = canvas.getContext("webgl");

    		if (!gl) {
    			console.error("WebGL not supported");
    			return;
    		}

    		// Vertex shader source
    		const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    		// Fragment shader source with user-provided shader code
    		const fragmentShaderSource = `
      precision mediump float;
      uniform vec3 iResolution;
      uniform float iTime;
      uniform vec4 iMouse;
      uniform sampler2D iChannel0;
      uniform sampler2D iChannel1;
      uniform sampler2D iChannel2;
      uniform sampler2D iChannel3;

      // User-provided shader code
      ${shader}

      void main() {
        vec4 color;
        mainImage(color, gl_FragCoord.xy);
        gl_FragColor = color;
      }
    `;

    		// Compile shaders
    		function compileShader(type, source) {
    			const shader = gl.createShader(type);
    			gl.shaderSource(shader, source);
    			gl.compileShader(shader);

    			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    				const infoLog = gl.getShaderInfoLog(shader);
    				console.error("Shader compile failed:\n", infoLog);
    				console.error("Shader source:\n", source);
    				gl.deleteShader(shader);
    				return null;
    			}

    			return shader;
    		}

    		const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    		const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    		if (!vertexShader || !fragmentShader) {
    			console.error("Shader compilation failed. Please check your shader code.");
    			return;
    		}

    		// Link program
    		program = gl.createProgram();

    		gl.attachShader(program, vertexShader);
    		gl.attachShader(program, fragmentShader);
    		gl.linkProgram(program);

    		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    			console.error("Program failed to link: " + gl.getProgramInfoLog(program));
    			gl.deleteProgram(program);
    			return;
    		}

    		gl.useProgram(program);

    		// Set up a full-screen quad
    		const positionLocation = gl.getAttribLocation(program, "position");

    		const positionBuffer = gl.createBuffer();
    		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    		const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    		gl.enableVertexAttribArray(positionLocation);
    		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    		// Get uniform locations
    		const iResolutionLocation = gl.getUniformLocation(program, "iResolution");

    		const iTimeLocation = gl.getUniformLocation(program, "iTime");
    		const iMouseLocation = gl.getUniformLocation(program, "iMouse");

    		const iChannelLocations = [
    			gl.getUniformLocation(program, "iChannel0"),
    			gl.getUniformLocation(program, "iChannel1"),
    			gl.getUniformLocation(program, "iChannel2"),
    			gl.getUniformLocation(program, "iChannel3")
    		];

    		// Load textures for iChannels
    		[iChannel0, iChannel1, iChannel2, iChannel3].forEach((channel, index) => {
    			if (channel) {
    				loadTexture(gl, channel, index);
    			}
    		});

    		// Event listener for window resize
    		window.addEventListener("resize", handleResize);

    		handleResize(); // Set initial size

    		// Rendering loop
    		function render() {
    			const currentTime = Date.now();
    			const elapsedTime = (currentTime - startTime) / 1000;
    			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    			gl.clear(gl.COLOR_BUFFER_BIT);

    			// Set uniform values
    			gl.uniform3f(iResolutionLocation, canvas.width, canvas.height, 1.0);

    			gl.uniform1f(iTimeLocation, elapsedTime);
    			gl.uniform4f(iMouseLocation, iMouse.x, iMouse.y, iMouse.z, iMouse.w);

    			// Bind iChannel samplers
    			iChannelLocations.forEach((location, index) => {
    				gl.uniform1i(location, index);
    			});

    			gl.drawArrays(gl.TRIANGLES, 0, 6);
    			animationFrameId = requestAnimationFrame(render);
    		}

    		render();

    		// Event listeners for mouse interactions
    		canvas.addEventListener("mousemove", handleMouseMove);

    		canvas.addEventListener("mousedown", handleMouseDown);
    		canvas.addEventListener("mouseup", handleMouseUp);
    	});

    	// Move onDestroy outside of onMount
    	onDestroy(() => {
    		// Cancel the animation frame
    		cancelAnimationFrame(animationFrameId);

    		// Remove event listeners
    		canvas.removeEventListener("mousemove", handleMouseMove);

    		canvas.removeEventListener("mousedown", handleMouseDown);
    		canvas.removeEventListener("mouseup", handleMouseUp);
    		window.removeEventListener("resize", handleResize);

    		// Clean up WebGL resources if necessary
    		if (gl && program) {
    			gl.deleteProgram(program);
    		}
    	});

    	$$self.$$.on_mount.push(function () {
    		if (shader === undefined && !('shader' in $$props || $$self.$$.bound[$$self.$$.props['shader']])) {
    			console_1.warn("<ShaderToy> was created without expected prop 'shader'");
    		}
    	});

    	const writable_props = [
    		'shader',
    		'iResolution',
    		'iMouse',
    		'iChannel0',
    		'iChannel1',
    		'iChannel2',
    		'iChannel3'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<ShaderToy> was created with unknown prop '${key}'`);
    	});

    	function canvas_1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			canvas = $$value;
    			$$invalidate(0, canvas);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('shader' in $$props) $$invalidate(3, shader = $$props.shader);
    		if ('iResolution' in $$props) $$invalidate(1, iResolution = $$props.iResolution);
    		if ('iMouse' in $$props) $$invalidate(2, iMouse = $$props.iMouse);
    		if ('iChannel0' in $$props) $$invalidate(4, iChannel0 = $$props.iChannel0);
    		if ('iChannel1' in $$props) $$invalidate(5, iChannel1 = $$props.iChannel1);
    		if ('iChannel2' in $$props) $$invalidate(6, iChannel2 = $$props.iChannel2);
    		if ('iChannel3' in $$props) $$invalidate(7, iChannel3 = $$props.iChannel3);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		onDestroy,
    		shader,
    		canvas,
    		gl,
    		program,
    		animationFrameId,
    		startTime,
    		mouseDown,
    		iResolution,
    		iMouse,
    		iChannel0,
    		iChannel1,
    		iChannel2,
    		iChannel3,
    		handleMouseMove,
    		handleMouseDown,
    		handleMouseUp,
    		handleResize,
    		loadTexture
    	});

    	$$self.$inject_state = $$props => {
    		if ('shader' in $$props) $$invalidate(3, shader = $$props.shader);
    		if ('canvas' in $$props) $$invalidate(0, canvas = $$props.canvas);
    		if ('gl' in $$props) gl = $$props.gl;
    		if ('program' in $$props) program = $$props.program;
    		if ('animationFrameId' in $$props) animationFrameId = $$props.animationFrameId;
    		if ('startTime' in $$props) startTime = $$props.startTime;
    		if ('mouseDown' in $$props) mouseDown = $$props.mouseDown;
    		if ('iResolution' in $$props) $$invalidate(1, iResolution = $$props.iResolution);
    		if ('iMouse' in $$props) $$invalidate(2, iMouse = $$props.iMouse);
    		if ('iChannel0' in $$props) $$invalidate(4, iChannel0 = $$props.iChannel0);
    		if ('iChannel1' in $$props) $$invalidate(5, iChannel1 = $$props.iChannel1);
    		if ('iChannel2' in $$props) $$invalidate(6, iChannel2 = $$props.iChannel2);
    		if ('iChannel3' in $$props) $$invalidate(7, iChannel3 = $$props.iChannel3);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		canvas,
    		iResolution,
    		iMouse,
    		shader,
    		iChannel0,
    		iChannel1,
    		iChannel2,
    		iChannel3,
    		canvas_1_binding
    	];
    }

    class ShaderToy extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			shader: 3,
    			iResolution: 1,
    			iMouse: 2,
    			iChannel0: 4,
    			iChannel1: 5,
    			iChannel2: 6,
    			iChannel3: 7
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ShaderToy",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get shader() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shader(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iResolution() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iResolution(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iMouse() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iMouse(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iChannel0() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iChannel0(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iChannel1() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iChannel1(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iChannel2() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iChannel2(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get iChannel3() {
    		throw new Error("<ShaderToy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set iChannel3(value) {
    		throw new Error("<ShaderToy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var VShader = `
// Improved noise function using a noise texture in iChannel0
float noise(vec2 p) {
    return texture2D(iChannel0, p * 0.1).r;
}

// Fractal Brownian Motion function
float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 50; i++) {
        f += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return f;
}

// Function to compute the Mandelbrot set
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    const int maxIter = 1000;
    for (int i = 0; i < maxIter; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 4.0) break;
    }
    return float(z) / float(maxIter);
}

// Neon color palette for the Mandelbrot set
vec3 neonPalette(float t) {
    // Bright color palette
    return vec3(0.5 + 0.5 * sin(6.2831 * (t + vec3(0.0, 0.33, 0.66))));
}

// Rotation matrix
mat2 Rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Star function
float Star(vec2 uv, float a, float sparkle) {
    vec2 av1 = abs(uv);
    vec2 av2 = abs(uv * Rot(a));
    vec2 av = min(av1, av2);

    float d = length(uv);
    float star = av1.x * av1.y;
    star = max(star, av2.x * av2.y);
    star = max(0.0, 1.0 - star * 1e3);

    float m = min(5.0, 1e-2 / d);

    return m + pow(star, 4.0) * sparkle;
}

// Hash function
float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 145.54));
    p += dot(p, p + 45.23);
    return fract(p.x * p.y);
}

// Star layer
vec3 StarLayer(vec2 uv, float t, float sparkle) {
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    vec3 col = vec3(0.0);

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offs = vec2(float(x), float(y));
            float n = Hash21(id - offs);
            vec3 N = fract(n * vec3(10.0, 100.0, 1000.0));
            vec2 p = (N.xy - 0.5) * 0.7;

            float brightness = Star(gv - p + offs, n * 6.2831 + t, sparkle);
            vec3 star = brightness * vec3(0.7 + p.x, 0.4, 0.6 + p.y) * N.z * N.z;

            star *= 1.0 + sin((t + n) * 20.0) * smoothstep(
                sin(t * 0.1) * 0.5 + 0.5,
                1.0,
                fract(10.0 * n)
            );

            float d = length(gv + offs);

            col += star * smoothstep(1.5 * sin(t * 0.1), 0.8, d);
        }
    }
    return col;
}

// Adjusted mainImage function to match the expected signature
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalized pixel coordinates in the range [-1, 1]
    vec2 uv = (fragCoord - 0.5 * (iResolution.xy * .5)) / (iResolution.y * .5);

    // Time variable
    float t = iTime * 0.1;

    // Space distortion into a fluid non-Euclidean shape
    vec2 distortion = fbm(uv * 3.0 + t) * vec2(0.5, 0.5);
    uv += distortion;

    // Mandelbrot set calculation
    vec2 c = uv * vec2(3.5, 2.0) + vec2(-2.5, -1.0);
    float m = mandelbrot(c);

    // Neon color based on the Mandelbrot set
    vec3 neonColor = neonPalette(m);
    neonColor *= pow(1.0 - m, -30.0); // Neon glow intensity

    // Initialize color
    vec3 col = vec3(0.0);

    // Polar coordinates
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Spiral movement over time
    float spiral = angle + r * -7.0 - t * 0.01 + sin(-t + r * -5.0) * 0.5;
    float arms = sin(spiral * 2.6 * iMouse.x / (iMouse.y + 0.0001)); // Avoid division by zero

    // Cloudy nebula using fbm
    float n = fbm(uv * 5.0 + vec2(t * -0.05, t * -0.3));

    // Nebula intensity and color blending
    float nebulaIntensity = exp(-pow(r * 1.5, 2.0)) * arms * n;
    nebulaIntensity *= pow(1.0 - m, 2.0);
    nebulaIntensity = smoothstep(0.0, 1.0, nebulaIntensity);

    // Pastel pink and gold colors
    vec3 pastelPink = vec3(1.0, 0.7, 0.85);
    vec3 gold = vec3(1.0, 0.85, 0.5);

    // Mix colors like in a painting
    vec3 nebulaColor = mix(pastelPink, gold, n);

    // Mix neon color with nebula color
    nebulaColor = mix(nebulaColor, neonColor, 0.05);

    // Apply nebula color
    col += nebulaIntensity * nebulaColor;

    // Core glow
    float coreGlow = exp(-pow(r * 4.0, 2.0));
    vec3 coreColor = gold;
    col += coreGlow * coreColor;

    // Add star layers
    float sparkle = 1.0;
    vec3 stars = StarLayer(uv * 10.0, t, sparkle);
    col += stars;

    // Final color adjustments
    col = pow(col, vec3(0.4545));

    // Output color
    fragColor = vec4(col, 1.0);
}
`;

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=} start
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && stop) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    /* src\App.svelte generated by Svelte v3.59.2 */

    const file = "src\\App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[19] = list[i];
    	child_ctx[21] = i;
    	return child_ctx;
    }

    // (99:6) {#each empresaData.tipos as tipo, index}
    function create_each_block_2(ctx) {
    	let option;
    	let t_value = /*tipo*/ ctx[19].tipo + "";
    	let t;
    	let option_selected_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.selected = option_selected_value = /*$selectedEmpresaIndex*/ ctx[0] === /*index*/ ctx[21];
    			option.__value = /*index*/ ctx[21];
    			option.value = option.__value;
    			add_location(option, file, 99, 8, 3470);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex*/ 1 && option_selected_value !== (option_selected_value = /*$selectedEmpresaIndex*/ ctx[0] === /*index*/ ctx[21])) {
    				prop_dev(option, "selected", option_selected_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(99:6) {#each empresaData.tipos as tipo, index}",
    		ctx
    	});

    	return block;
    }

    // (135:2) {#if empresaData.tipos.length > 0}
    function create_if_block(ctx) {
    	let div3;
    	let h2;
    	let t0_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].paso + "";
    	let t0;
    	let t1;
    	let p0;
    	let t2_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].descripcion + "";
    	let t2;
    	let t3;
    	let div1;
    	let strong0;
    	let t5;
    	let h3;
    	let t6_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].subpaso + "";
    	let t6;
    	let t7;
    	let div0;
    	let strong1;
    	let t9;
    	let p1;
    	let t10_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].detalle[/*$currentDetailIndex*/ ctx[3]] + "";
    	let t10;
    	let t11;
    	let t12;
    	let div2;
    	let strong2;
    	let t14;
    	let ul;
    	let if_block = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].caveats?.length > 0 && create_if_block_1(ctx);
    	let each_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].documentos;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			h2 = element("h2");
    			t0 = text(t0_value);
    			t1 = space();
    			p0 = element("p");
    			t2 = text(t2_value);
    			t3 = space();
    			div1 = element("div");
    			strong0 = element("strong");
    			strong0.textContent = "Subpaso Actual:";
    			t5 = space();
    			h3 = element("h3");
    			t6 = text(t6_value);
    			t7 = space();
    			div0 = element("div");
    			strong1 = element("strong");
    			strong1.textContent = "Detalle Actual:";
    			t9 = space();
    			p1 = element("p");
    			t10 = text(t10_value);
    			t11 = space();
    			if (if_block) if_block.c();
    			t12 = space();
    			div2 = element("div");
    			strong2 = element("strong");
    			strong2.textContent = "Documentos necesarios:";
    			t14 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(h2, file, 136, 6, 4505);
    			add_location(p0, file, 139, 6, 4604);
    			add_location(strong0, file, 145, 8, 4756);
    			add_location(h3, file, 146, 8, 4797);
    			add_location(strong1, file, 152, 10, 4986);
    			add_location(p1, file, 153, 10, 5029);
    			attr_dev(div0, "class", "substeps-details svelte-yh5yw0");
    			add_location(div0, file, 151, 8, 4945);
    			attr_dev(div1, "class", "substeps-list svelte-yh5yw0");
    			add_location(div1, file, 144, 6, 4720);
    			add_location(strong2, file, 172, 8, 5705);
    			add_location(ul, file, 173, 8, 5753);
    			attr_dev(div2, "class", "document-list svelte-yh5yw0");
    			add_location(div2, file, 171, 6, 5669);
    			attr_dev(div3, "class", "step-details svelte-yh5yw0");
    			attr_dev(div3, "aria-live", "polite");
    			add_location(div3, file, 135, 4, 4453);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, h2);
    			append_dev(h2, t0);
    			append_dev(div3, t1);
    			append_dev(div3, p0);
    			append_dev(p0, t2);
    			append_dev(div3, t3);
    			append_dev(div3, div1);
    			append_dev(div1, strong0);
    			append_dev(div1, t5);
    			append_dev(div1, h3);
    			append_dev(h3, t6);
    			append_dev(div1, t7);
    			append_dev(div1, div0);
    			append_dev(div0, strong1);
    			append_dev(div0, t9);
    			append_dev(div0, p1);
    			append_dev(p1, t10);
    			append_dev(div1, t11);
    			if (if_block) if_block.m(div1, null);
    			append_dev(div3, t12);
    			append_dev(div3, div2);
    			append_dev(div2, strong2);
    			append_dev(div2, t14);
    			append_dev(div2, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 3 && t0_value !== (t0_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].paso + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 3 && t2_value !== (t2_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].descripcion + "")) set_data_dev(t2, t2_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep, $currentSubStep*/ 7 && t6_value !== (t6_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].subpaso + "")) set_data_dev(t6, t6_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep, $currentSubStep, $currentDetailIndex*/ 15 && t10_value !== (t10_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].detalle[/*$currentDetailIndex*/ ctx[3]] + "")) set_data_dev(t10, t10_value);

    			if (empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].caveats?.length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*empresaData, $selectedEmpresaIndex, $currentStep*/ 3) {
    				each_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].documentos;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(135:2) {#if empresaData.tipos.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (160:8) {#if empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats?.length > 0}
    function create_if_block_1(ctx) {
    	let div;
    	let strong;
    	let t1;
    	let ul;
    	let each_value_1 = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].caveats;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			strong = element("strong");
    			strong.textContent = "Caveats:";
    			t1 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(strong, file, 161, 12, 5374);
    			add_location(ul, file, 162, 12, 5412);
    			attr_dev(div, "class", "caveats svelte-yh5yw0");
    			add_location(div, file, 160, 10, 5340);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, strong);
    			append_dev(div, t1);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*empresaData, $selectedEmpresaIndex, $currentStep, $currentSubStep*/ 7) {
    				each_value_1 = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].caveats;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(160:8) {#if empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats?.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (164:14) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats as caveat}
    function create_each_block_1(ctx) {
    	let li;
    	let t_value = /*caveat*/ ctx[16] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			add_location(li, file, 164, 16, 5560);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex, $currentStep, $currentSubStep*/ 7 && t_value !== (t_value = /*caveat*/ ctx[16] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(164:14) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].subpasos[$currentSubStep].caveats as caveat}",
    		ctx
    	});

    	return block;
    }

    // (175:10) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].documentos as documento}
    function create_each_block(ctx) {
    	let li;
    	let t_value = /*documento*/ ctx[13] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "document-list-item svelte-yh5yw0");
    			add_location(li, file, 175, 12, 5873);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 3 && t_value !== (t_value = /*documento*/ ctx[13] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(175:10) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].documentos as documento}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div2;
    	let div0;
    	let label;
    	let t1;
    	let select;
    	let t2;
    	let p;
    	let t3_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].descripcion + "";
    	let t3;
    	let t4;
    	let div1;
    	let button0;
    	let t5;
    	let button0_disabled_value;
    	let t6;
    	let button1;
    	let t7;
    	let button1_disabled_value;
    	let t8;
    	let t9;
    	let div3;
    	let shadertoy;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_2 = empresaData.tipos;
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let if_block = empresaData.tipos.length > 0 && create_if_block(ctx);

    	shadertoy = new ShaderToy({
    			props: {
    				shader: VShader,
    				iChannel0: './t1.jpg',
    				iChannel1: './t1.jpg'
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			label = element("label");
    			label.textContent = "Seleccione el tipo de empresa:";
    			t1 = space();
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			p = element("p");
    			t3 = text(t3_value);
    			t4 = space();
    			div1 = element("div");
    			button0 = element("button");
    			t5 = text("Anterior");
    			t6 = space();
    			button1 = element("button");
    			t7 = text("Siguiente");
    			t8 = space();
    			if (if_block) if_block.c();
    			t9 = space();
    			div3 = element("div");
    			create_component(shadertoy.$$.fragment);
    			attr_dev(label, "for", "empresa-tipo");
    			add_location(label, file, 93, 4, 3247);
    			attr_dev(select, "id", "empresa-tipo");
    			add_location(select, file, 94, 4, 3316);
    			add_location(p, file, 104, 4, 3608);
    			attr_dev(div0, "class", "empresa-selector svelte-yh5yw0");
    			add_location(div0, file, 92, 2, 3212);
    			button0.disabled = button0_disabled_value = /*$currentStep*/ ctx[1] === 0 && /*$currentSubStep*/ ctx[2] === 0 && /*$currentDetailIndex*/ ctx[3] === 0;
    			attr_dev(button0, "class", "svelte-yh5yw0");
    			add_location(button0, file, 110, 4, 3725);
    			button1.disabled = button1_disabled_value = /*$currentStep*/ ctx[1] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos.length - 1 && /*$currentSubStep*/ ctx[2] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos.length - 1 && /*$currentDetailIndex*/ ctx[3] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].detalle.length - 1;
    			attr_dev(button1, "class", "svelte-yh5yw0");
    			add_location(button1, file, 116, 4, 3896);
    			attr_dev(div1, "class", "step-buttons svelte-yh5yw0");
    			add_location(div1, file, 109, 2, 3694);
    			attr_dev(div2, "class", "step-container svelte-yh5yw0");
    			add_location(div2, file, 91, 0, 3181);
    			attr_dev(div3, "class", "shader svelte-yh5yw0");
    			add_location(div3, file, 183, 0, 5993);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, label);
    			append_dev(div0, t1);
    			append_dev(div0, select);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(select, null);
    				}
    			}

    			append_dev(div0, t2);
    			append_dev(div0, p);
    			append_dev(p, t3);
    			append_dev(div2, t4);
    			append_dev(div2, div1);
    			append_dev(div1, button0);
    			append_dev(button0, t5);
    			append_dev(div1, t6);
    			append_dev(div1, button1);
    			append_dev(button1, t7);
    			append_dev(div2, t8);
    			if (if_block) if_block.m(div2, null);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div3, anchor);
    			mount_component(shadertoy, div3, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(select, "change", /*change_handler*/ ctx[11], false, false, false, false),
    					listen_dev(button0, "click", /*previousStep*/ ctx[9], false, false, false, false),
    					listen_dev(button1, "click", /*nextDetail*/ ctx[8], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$selectedEmpresaIndex, empresaData*/ 1) {
    				each_value_2 = empresaData.tipos;
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}

    			if ((!current || dirty & /*$selectedEmpresaIndex*/ 1) && t3_value !== (t3_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].descripcion + "")) set_data_dev(t3, t3_value);

    			if (!current || dirty & /*$currentStep, $currentSubStep, $currentDetailIndex*/ 14 && button0_disabled_value !== (button0_disabled_value = /*$currentStep*/ ctx[1] === 0 && /*$currentSubStep*/ ctx[2] === 0 && /*$currentDetailIndex*/ ctx[3] === 0)) {
    				prop_dev(button0, "disabled", button0_disabled_value);
    			}

    			if (!current || dirty & /*$currentStep, $selectedEmpresaIndex, $currentSubStep, $currentDetailIndex*/ 15 && button1_disabled_value !== (button1_disabled_value = /*$currentStep*/ ctx[1] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos.length - 1 && /*$currentSubStep*/ ctx[2] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos.length - 1 && /*$currentDetailIndex*/ ctx[3] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[0]].pasos[/*$currentStep*/ ctx[1]].subpasos[/*$currentSubStep*/ ctx[2]].detalle.length - 1)) {
    				prop_dev(button1, "disabled", button1_disabled_value);
    			}

    			if (empresaData.tipos.length > 0) if_block.p(ctx, dirty);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(shadertoy.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(shadertoy.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_each(each_blocks, detaching);
    			if (if_block) if_block.d();
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div3);
    			destroy_component(shadertoy);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $selectedEmpresaIndex;
    	let $currentStep;
    	let $currentSubStep;
    	let $currentDetailIndex;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);

    	function persistentWritable(key, initialValue) {
    		const store = writable(initialValue, () => {
    			const json = localStorage.getItem(key);

    			if (json !== null) {
    				store.set(JSON.parse(json));
    			}

    			const unsubscribe = store.subscribe(value => {
    				localStorage.setItem(key, JSON.stringify(value));
    			});

    			return unsubscribe;
    		});

    		return store;
    	}

    	// Initialize persistent stores
    	let selectedEmpresaIndex = persistentWritable("selectedEmpresaIndex", 0);

    	validate_store(selectedEmpresaIndex, 'selectedEmpresaIndex');
    	component_subscribe($$self, selectedEmpresaIndex, value => $$invalidate(0, $selectedEmpresaIndex = value));
    	let currentStep = persistentWritable("currentStep", 0);
    	validate_store(currentStep, 'currentStep');
    	component_subscribe($$self, currentStep, value => $$invalidate(1, $currentStep = value));
    	let currentSubStep = persistentWritable("currentSubStep", 0);
    	validate_store(currentSubStep, 'currentSubStep');
    	component_subscribe($$self, currentSubStep, value => $$invalidate(2, $currentSubStep = value));
    	let currentDetailIndex = persistentWritable("currentDetailIndex", 0);
    	validate_store(currentDetailIndex, 'currentDetailIndex');
    	component_subscribe($$self, currentDetailIndex, value => $$invalidate(3, $currentDetailIndex = value));

    	// Functions using the stores
    	function nextDetail() {
    		const currentDetailIndexValue = $currentDetailIndex;
    		const currentSubStepValue = $currentSubStep;
    		const currentStepValue = $currentStep;
    		const selectedEmpresaIndexValue = $selectedEmpresaIndex;
    		const empresa = empresaData.tipos[selectedEmpresaIndexValue];
    		const currentPaso = empresa.pasos[currentStepValue];
    		const currentSubPaso = currentPaso.subpasos[currentSubStepValue];

    		if (currentDetailIndexValue < currentSubPaso.detalle.length - 1) {
    			currentDetailIndex.update(n => n + 1);
    		} else if (currentSubStepValue < currentPaso.subpasos.length - 1) {
    			currentSubStep.update(n => n + 1);
    			currentDetailIndex.set(0);
    		} else if (currentStepValue < empresa.pasos.length - 1) {
    			currentStep.update(n => n + 1);
    			currentSubStep.set(0);
    			currentDetailIndex.set(0);
    		}
    	}

    	function previousStep() {
    		let currentDetailIndexValue = $currentDetailIndex;
    		let currentSubStepValue = $currentSubStep;
    		let currentStepValue = $currentStep;
    		let selectedEmpresaIndexValue = $selectedEmpresaIndex;

    		if (currentDetailIndexValue > 0) {
    			currentDetailIndex.update(n => n - 1);
    		} else if (currentSubStepValue > 0) {
    			const newSubStepValue = currentSubStepValue - 1;
    			currentSubStep.set(newSubStepValue);
    			const subpasos = empresaData.tipos[selectedEmpresaIndexValue].pasos[currentStepValue].subpasos;
    			const detalleLength = subpasos[newSubStepValue].detalle.length;
    			currentDetailIndex.set(detalleLength - 1);
    		} else if (currentStepValue > 0) {
    			const newStepValue = currentStepValue - 1;
    			currentStep.set(newStepValue);
    			const pasos = empresaData.tipos[selectedEmpresaIndexValue].pasos;
    			const subpasos = pasos[newStepValue].subpasos;
    			const newSubStepIndex = subpasos.length - 1;
    			currentSubStep.set(newSubStepIndex);
    			const detalleLength = subpasos[newSubStepIndex].detalle.length;
    			currentDetailIndex.set(detalleLength - 1);
    		}
    	}

    	function updateSteps(selectedIndex) {
    		selectedEmpresaIndex.set(selectedIndex);
    		currentStep.set(0);
    		currentSubStep.set(0);
    		currentDetailIndex.set(0);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const change_handler = e => updateSteps(e.target.selectedIndex);

    	$$self.$capture_state = () => ({
    		empresaData,
    		ShaderToy,
    		VShader,
    		writable,
    		persistentWritable,
    		selectedEmpresaIndex,
    		currentStep,
    		currentSubStep,
    		currentDetailIndex,
    		nextDetail,
    		previousStep,
    		updateSteps,
    		$selectedEmpresaIndex,
    		$currentStep,
    		$currentSubStep,
    		$currentDetailIndex
    	});

    	$$self.$inject_state = $$props => {
    		if ('selectedEmpresaIndex' in $$props) $$invalidate(4, selectedEmpresaIndex = $$props.selectedEmpresaIndex);
    		if ('currentStep' in $$props) $$invalidate(5, currentStep = $$props.currentStep);
    		if ('currentSubStep' in $$props) $$invalidate(6, currentSubStep = $$props.currentSubStep);
    		if ('currentDetailIndex' in $$props) $$invalidate(7, currentDetailIndex = $$props.currentDetailIndex);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		$selectedEmpresaIndex,
    		$currentStep,
    		$currentSubStep,
    		$currentDetailIndex,
    		selectedEmpresaIndex,
    		currentStep,
    		currentSubStep,
    		currentDetailIndex,
    		nextDetail,
    		previousStep,
    		updateSteps,
    		change_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
