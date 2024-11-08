
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
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
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

    var empresaData = {
      tipos: [
        {
          tipo: "Persona Física",
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
                    "Prepare la información sobre el uso del inmueble y adjúde el contrato de arrendamiento si corresponde: tenga una copia digital del contrato lista para ser subida al formulario.",
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
                {
                  subpaso:
                    "Proporcione toda la documentación requerida por la municipalidad.",
                  detalle: [
                    "Prepare copias de todos los documentos, incluidos la identificación y el Permiso Sanitario: lleve una carpeta adicional para copias adicionales en caso de ser necesario.",
                    "Revise la lista de requisitos en el sitio web de la municipalidad antes de asistir: marque cada documento como 'listo' a medida que lo prepare.",
                    "Solicite un recibo que confirme la entrega de los documentos: guarde el recibo como comprobante de que la solicitud fue presentada.",
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
          tipo: "Sociedad Anónima",
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
                },
                {
                  subpaso:
                    "Incluya información detallada sobre los accionistas y el capital inicial.",
                  detalle: [
                    "Especifique la cantidad de acciones y la participación de cada socio: defina claramente cómo se dividirán las ganancias y responsabilidades.",
                    "Defina el monto del capital social y cómo será distribuido: asegúrese de que todos los accionistas estén de acuerdo con la distribución propuesta.",
                    "Incluya la información de contacto de cada socio y sus responsabilidades: verifique que cada socio entienda sus responsabilidades y esté dispuesto a cumplirlas.",
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
                },
                {
                  subpaso: "Pago de la CCSS",
                  detalle: [
                    "Calcule las cargas sociales mensuales en base a los salarios de los empleados: este cálculo puede hacerse a través del sistema en línea de la CCSS.",
                    "Realice el pago de las cargas sociales antes del día 15 de cada mes: puede hacer el pago en línea o en un banco autorizado.",
                    "Guarde el comprobante del pago como respaldo para auditorías.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y patentes de la sociedad: generalmente se renuevan anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para renovar los permisos: presente el comprobante de pago de impuestos y otros documentos requeridos.",
                    "Pague las tarifas correspondientes y guarde los comprobantes.",
                  ],
                },
                {
                  subpaso: "Reportes Financieros Anuales",
                  detalle: [
                    "Contrate a un contador para preparar los estados financieros anuales de la sociedad.",
                    "Presente el reporte anual de ingresos y gastos al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o con ayuda del contador.",
                    "Asegúrese de cumplir con todas las normativas contables y fiscales para evitar sanciones.",
                  ],
                },
              ],
            },
          ],
        },
        {
          tipo: "Sociedad de Responsabilidad Limitada (S.R.L.)",
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
              paso: "Elaborar el Pacto Constitutivo",
              descripcion:
                "Redacte el pacto constitutivo con la asistencia de un abogado, que incluya información sobre los socios, el capital social y la administración.",
              documentos: ["Pacto Constitutivo", "Identificación de los socios"],
              subpasos: [
                {
                  subpaso:
                    "Contrate a un abogado para la redacción del pacto constitutivo.",
                  detalle: [
                    "Busque un abogado especializado en derecho corporativo: solicite recomendaciones a colegas o busque en directorios de abogados certificados.",
                    "Contacte al abogado y programe una reunión para discutir los detalles de la sociedad: prepare una lista de preguntas sobre el proceso y costos involucrados.",
                    "Asegúrese de llevar información de los socios, incluyendo nombres completos y copias de identificación: confirme que cada socio tenga sus documentos en regla.",
                  ],
                },
                {
                  subpaso:
                    "Defina la participación de los socios y las contribuciones de capital.",
                  detalle: [
                    "Especifique la cantidad de participación de cada socio en la empresa: asegúrese de que todos los socios estén de acuerdo con la distribución de participación.",
                    "Establezca la contribución de capital inicial de cada socio: puede ser en efectivo, bienes o servicios valorados en dinero.",
                    "Defina claramente las responsabilidades y derechos de cada socio: asegúrese de que todos los términos estén claros para todos los socios.",
                  ],
                },
                {
                  subpaso: "Firme el pacto constitutivo ante notario.",
                  detalle: [
                    "Coordine una cita con el abogado y un notario para firmar el pacto: confirme la disponibilidad de todos los socios antes de fijar la fecha.",
                    "Asegúrese de que todos los socios estén presentes y lleven identificación: revise los requisitos del notario para asegurarse de cumplirlos.",
                    "El notario autenticará las firmas y dará fe de la validez del documento: solicite una copia certificada del documento para cada socio.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la sociedad de responsabilidad limitada en el Registro Nacional para formalizar la empresa.",
              documentos: [
                "Pacto Constitutivo autenticado",
                "Certificación de disponibilidad de nombre",
                "Identificación de los socios",
              ],
              subpasos: [
                {
                  subpaso: "Complete el formulario de inscripción.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para obtener el formulario de inscripción.",
                    "Complete toda la información requerida sobre los socios y la empresa: asegúrese de que los datos sean precisos.",
                    "Adjunte todos los documentos necesarios, incluyendo el pacto constitutivo autenticado y la certificación de nombre.",
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
          pasos: [
            {
              paso: "Definir el Objeto de la Cooperativa",
              descripcion:
                "Determine la misión, visión y el objeto de la cooperativa, asegurándose de que esté alineado con los principios cooperativos.",
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
                },
                {
                  subpaso: "Redacte los estatutos de la cooperativa.",
                  detalle: [
                    "Contrate un abogado especializado en cooperativas para redactar los estatutos: asegúrese de incluir los derechos y responsabilidades de los miembros.",
                    "Incluya información sobre el proceso de toma de decisiones y estructura de la cooperativa: asegúrese de que todos los miembros entiendan y aprueben estos estatutos.",
                    "Revise y finalice los estatutos con el abogado y los miembros fundadores: todos deben estar de acuerdo con los términos antes de proceder.",
                  ],
                },
              ],
            },
            {
              paso: "Constitución de la Cooperativa",
              descripcion:
                "Formalice la constitución de la cooperativa mediante una asamblea constitutiva y la firma de los estatutos.",
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
                },
                {
                  subpaso: "Aprobación de los estatutos y firma de los documentos.",
                  detalle: [
                    "Presente los estatutos a todos los miembros para su aprobación: asegúrese de responder a todas las preguntas y aclarar cualquier duda.",
                    "Todos los miembros fundadores deben firmar los estatutos: coordine con un notario para que autentique las firmas y asegure la validez del documento.",
                    "El notario debe emitir una copia certificada del acta de la asamblea: guarde este documento como evidencia de la constitución de la cooperativa.",
                  ],
                },
              ],
            },
            {
              paso: "Inscripción en el Registro Nacional",
              descripcion:
                "Registre la cooperativa en el Registro Nacional para formalizar su existencia legal.",
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
                },
                {
                  subpaso: "Presente la documentación en el Registro Nacional.",
                  detalle: [
                    "Visite la oficina del Registro Nacional o su sitio web para conocer los requisitos específicos para cooperativas.",
                    "Complete el formulario de inscripción y adjunte los documentos necesarios: asegúrese de llenar correctamente todos los campos.",
                    "Pague las tarifas correspondientes al registro de la cooperativa: guarde el recibo de pago como comprobante.",
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
                "Afíliese al Instituto Nacional de Fomento Cooperativo (INFOCOOP) para recibir apoyo y asesoría.",
              documentos: ["Personería jurídica", "Formulario de afiliación"],
              subpasos: [
                {
                  subpaso: "Prepare la documentación para la afiliación.",
                  detalle: [
                    "Complete el formulario de afiliación proporcionado por INFOCOOP: asegúrese de llenar toda la información solicitada.",
                    "Adjunte una copia de la personería jurídica de la cooperativa: asegúrese de que la copia esté actualizada y sea legible.",
                    "Prepare una lista de los miembros y sus funciones dentro de la cooperativa: INFOCOOP requiere esta información para el registro.",
                  ],
                },
                {
                  subpaso: "Presente la solicitud de afiliación.",
                  detalle: [
                    "Visite la oficina de INFOCOOP o presente la solicitud en línea si está disponible.",
                    "Entregue toda la documentación requerida y asegúrese de recibir un comprobante de recepción.",
                    "Espere la respuesta de INFOCOOP sobre la afiliación: el instituto puede requerir información adicional o una visita a la cooperativa.",
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
                },
                {
                  subpaso: "Pago de la Caja Costarricense de Seguro Social (CCSS)",
                  detalle: [
                    "Calcule las cargas sociales que debe pagar cada mes en base a los salarios pagados a los empleados y miembros de la cooperativa: este cálculo puede hacerlo a través del sistema en línea de la CCSS.",
                    "Visite el portal de la CCSS o un banco autorizado para realizar el pago de las cargas sociales: el pago debe hacerse antes del día 15 de cada mes.",
                    "Guarde el comprobante de pago como respaldo para futuras auditorías o revisiones.",
                  ],
                },
                {
                  subpaso: "Renovación de Permisos y Licencias",
                  detalle: [
                    "Revise las fechas de vencimiento de los permisos y licencias de la cooperativa: estos permisos generalmente se deben renovar anualmente.",
                    "Visite la municipalidad y el Ministerio de Salud para presentar los documentos requeridos para la renovación: incluya una copia del permiso anterior y un comprobante de pago de impuestos municipales.",
                    "Pague las tarifas correspondientes y espere la aprobación de la renovación: asegúrese de guardar los comprobantes de pago y las nuevas licencias.",
                  ],
                },
                {
                  subpaso: "Asambleas Ordinarias y Extraordinarias",
                  detalle: [
                    "Programe una asamblea ordinaria al menos una vez al año para discutir el estado de la cooperativa y tomar decisiones importantes: asegúrese de notificar a todos los miembros con antelación.",
                    "Levante un acta de la asamblea y haga que todos los miembros la firmen: este documento es necesario para registrar cualquier decisión oficial tomada durante la reunión.",
                    "Si se requiere una asamblea extraordinaria para decisiones urgentes, notifique a los miembros y registre las decisiones en un acta: mantenga estos registros en un lugar seguro.",
                  ],
                },
                {
                  subpaso: "Contabilidad y Reportes Anuales",
                  detalle: [
                    "Contrate a un contador para llevar los libros contables de la cooperativa: los libros deben estar actualizados y cumplir con las normativas del Ministerio de Hacienda.",
                    "Prepare el reporte anual de ingresos y gastos: asegúrese de incluir todas las facturas y recibos de cada transacción durante el año.",
                    "Presente el reporte anual al Ministerio de Hacienda antes del 31 de marzo: esto se puede hacer a través del portal ATV o directamente con la ayuda del contador.",
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
    	let canvas_1_width_value;
    	let canvas_1_height_value;

    	const block = {
    		c: function create() {
    			canvas_1 = element("canvas");
    			attr_dev(canvas_1, "width", canvas_1_width_value = /*iResolution*/ ctx[0].x);
    			attr_dev(canvas_1, "height", canvas_1_height_value = /*iResolution*/ ctx[0].y);
    			attr_dev(canvas_1, "class", "svelte-57y0h8");
    			add_location(canvas_1, file$1, 239, 0, 6871);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, canvas_1, anchor);
    			/*canvas_1_binding*/ ctx[8](canvas_1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*iResolution*/ 1 && canvas_1_width_value !== (canvas_1_width_value = /*iResolution*/ ctx[0].x)) {
    				attr_dev(canvas_1, "width", canvas_1_width_value);
    			}

    			if (dirty & /*iResolution*/ 1 && canvas_1_height_value !== (canvas_1_height_value = /*iResolution*/ ctx[0].y)) {
    				attr_dev(canvas_1, "height", canvas_1_height_value);
    			}
    		},
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
    	image.crossOrigin = "";

    	image.onload = function () {
    		gl.activeTexture(gl.TEXTURE0 + unit);
    		gl.bindTexture(gl.TEXTURE_2D, texture);
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
          vec4 color = vec4(0.0);
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
    			$$invalidate(1, canvas);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('shader' in $$props) $$invalidate(3, shader = $$props.shader);
    		if ('iResolution' in $$props) $$invalidate(0, iResolution = $$props.iResolution);
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
    		loadTexture
    	});

    	$$self.$inject_state = $$props => {
    		if ('shader' in $$props) $$invalidate(3, shader = $$props.shader);
    		if ('canvas' in $$props) $$invalidate(1, canvas = $$props.canvas);
    		if ('gl' in $$props) gl = $$props.gl;
    		if ('program' in $$props) program = $$props.program;
    		if ('animationFrameId' in $$props) animationFrameId = $$props.animationFrameId;
    		if ('startTime' in $$props) startTime = $$props.startTime;
    		if ('mouseDown' in $$props) mouseDown = $$props.mouseDown;
    		if ('iResolution' in $$props) $$invalidate(0, iResolution = $$props.iResolution);
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
    		iResolution,
    		canvas,
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
    			iResolution: 0,
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
// "Cosmic Cycles" by Martijn Steinrucken aka BigWings/CountFrolic - 2020
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Email: countfrolic@gmail.com
// Twitter: @The_ArtOfCode
// YouTube: youtube.com/TheArtOfCodeIsCool

#define BURST
#define NUM_LAYERS 2
#define ITERATIONS 20

mat2 Rot(float a) {
    float s=sin(a), c=cos(a);
    return mat2(c,-s,s,c);
}

float Star(vec2 uv, float a, float sparkle) {
    vec2 av1 = abs(uv);
    vec2 av2 = abs(uv*Rot(a));
    vec2 av = min(av1, av2);
    
    float d = length(uv);
    float star = av1.x*av1.y;
    star = max(star, av2.x*av2.y);
    star = max(0., 1.-star*1e3);
    
    float m = min(5., 1e-2/d);
    
    return m + pow(star, 4.) * sparkle;
}

float Hash21(vec2 p) {
    p = fract(p * vec2(123.34,145.54));
    p += dot(p, p + 45.23);
    return fract(p.x * p.y);
}

vec3 StarLayer(vec2 uv, float t, float sparkle) {
    vec2 gv = fract(uv) - .5;
    vec2 id = floor(uv);
    vec3 col = vec3(0);
    
    #ifndef BURST
    t = 0.;
    #endif
    
    for(int y = -1; y <= 1; y++) {
        for(int x = -1; x <= 1; x++) {
            vec2 offs = vec2(float(x), float(y));
            float n = Hash21(id - offs);
            vec3 N = fract(n * vec3(10, 100, 1000));
            vec2 p = (N.xy - .5) * .7;
            
            float brightness = Star(gv - p + offs, n * 6.2831 + t, sparkle);
            vec3 star = brightness * vec3(.6 + p.x, .4, .6 + p.y) * N.z * N.z;
            
            star *= 1. + sin((t + n) * 20.) * smoothstep(sin(t) * .5 + .5, 1., fract(10. * n));
            
            float d = length(gv + offs);
            
            col += star * smoothstep(1.5, .8, d);
        }
    }
    return col;
}

float lightCircle(vec2 uv, float radius, vec2 position, float radiusReduction) {
    float d = length(uv - position) * radiusReduction;
    d = smoothstep(d, 0., radius);
    return 1. - d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float mouseDown = step(.1, iMouse.z);
    float scale = mix(.05, .005, mouseDown);
    vec2 look = (iMouse.xy / iResolution.xy - .5) * 3. * mouseDown;
    
    float time = iTime / 50. + 15.;
    vec2 res = iResolution.xy;
    vec2 uv = fragCoord.xy / res - vec2(.5) + look;
    uv *= vec2(res.x / res.y, 1.) * 4. * scale;
    vec2 M = iMouse.xy / iResolution.xy;
    
    M *= 10.;
    
    float t = -iTime / 3.;
    
    float twirl = sin(t * 10.);
    twirl *= twirl * twirl * sin(dot(uv, uv));
    uv *= Rot(-t * .02);
    
    uv *= 2. + sin(t * .05);
    
    vec3 col = vec3(0);
    float speed = -.02;
    #ifdef BURST
    speed = .1;
    float bla = sin(t + sin(t + max(sin(t), 0.1) * .5)) * .5 + .5;
    float d = dot(uv, uv);
    
    float a = atan(uv.x, uv.y);
    uv /= d;
    float burst = sin(iTime * .05);
    uv *= burst + .2;
    #endif
    
    float stp = 1.0 / float(NUM_LAYERS);
    
    for(int layer = 0; layer < NUM_LAYERS; layer++) {
        float i = float(layer) * stp;
        float lt = fract(t * speed + i);
        float scale = mix(10., .25, lt);
        float fade = smoothstep(0., .4, lt) * smoothstep(1., .95, lt); 
        vec2 sv = uv * scale + i * 134.53 - M;
        col += StarLayer(sv, t, fade) * fade;
    }
    
    #ifdef BURST
    float burstFade = smoothstep(0., .02, abs(burst));
    float size = .9 * sin(t) + 1.;
    size = max(size, sqrt(size));
    float fade = size / d;
    col *= mix(1., fade, burstFade);
    col += fade * .2 * vec3(1., .5, .1) * bla * burstFade;
    
    t *= 1.5;
    
    a -= M.x * .1;
    float rays = sin(a * 5. + t * 3.) - cos(a * 7. - t);
    rays *= sin(a + t + sin(a * 4.) * 10.) * .5 + .5;
    col += rays * bla * .1 * burstFade;
    col += 1. - burstFade;
    #else
    col *= 4.;
    #endif
    
    float len = dot(uv, uv) * .3 - .4;
    
    vec3 z = sin(time * vec3(.23, .19, .17));
    for (int i = 0; i < ITERATIONS; i++) {
        z += cos(z.zxy + uv.yxy * float(i) * len);
    }
    
    float val = z.r * .06 + .3;
    val -= smoothstep(.01 * cos(iTime), -.03, len * sin(iTime / 100.)) * cos(iTime / 100.) + len * .03 - .4;
    
    float timeSlow = 5.;
    float chosenTime = iTime * timeSlow;
    float radiusReduction = 1.;
    float radius = .1;
    float waveSpeed = 1.;
    float intensityGrowRate = 1.;
    float centralCircleRadius = radius * 2.5;
    float wavingRadius = centralCircleRadius + sin(chosenTime * waveSpeed) / intensityGrowRate;

    float centralCircle = lightCircle(uv, wavingRadius, vec2(0., 0.), radiusReduction);
    float rightCircle = lightCircle(uv, radius, vec2(cos(chosenTime), 0.), radiusReduction);
    float leftCircle = lightCircle(uv, radius, vec2(sin(chosenTime), 0.), radiusReduction);
    float otherRightCircle = lightCircle(uv, radius, vec2(sin(chosenTime + .75), 0.), radiusReduction);
    float otherLeftCircle = lightCircle(uv, radius, vec2(cos(chosenTime + .75), 0.), radiusReduction);

    fragColor = vec4(
        rightCircle + leftCircle + centralCircle + otherLeftCircle * 2.,
        rightCircle + rightCircle + centralCircle + otherRightCircle * 2.,
        leftCircle + leftCircle + centralCircle + otherRightCircle + otherLeftCircle,
        1.
    ) / vec4(
        vec3(max(val, .01)) / tan(col / 2. / tan(iTime / 100.)) * vec3(1., 5., 1.),
        1.
    );
}
`;

    /* src\App.svelte generated by Svelte v3.59.2 */
    const file = "src\\App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	child_ctx[17] = i;
    	return child_ctx;
    }

    // (122:6) {#each empresaData.tipos as tipo, index}
    function create_each_block_1(ctx) {
    	let option;
    	let t_value = /*tipo*/ ctx[15].tipo + "";
    	let t;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = /*index*/ ctx[17];
    			option.value = option.__value;
    			add_location(option, file, 122, 8, 4568);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(122:6) {#each empresaData.tipos as tipo, index}",
    		ctx
    	});

    	return block;
    }

    // (153:2) {#if empresaData.tipos.length > 0}
    function create_if_block(ctx) {
    	let div3;
    	let h2;
    	let t0_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].paso + "";
    	let t0;
    	let t1;
    	let p0;
    	let t2_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].descripcion + "";
    	let t2;
    	let t3;
    	let div1;
    	let strong0;
    	let t5;
    	let h3;
    	let t6_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].subpaso + "";
    	let t6;
    	let t7;
    	let div0;
    	let strong1;
    	let t9;
    	let p1;
    	let t10_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].detalle[/*$currentDetailIndex*/ ctx[2]] + "";
    	let t10;
    	let t11;
    	let div2;
    	let strong2;
    	let t13;
    	let ul;
    	let each_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].documentos;
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
    			div2 = element("div");
    			strong2 = element("strong");
    			strong2.textContent = "Documentos necesarios:";
    			t13 = space();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			add_location(h2, file, 154, 6, 5462);
    			add_location(p0, file, 157, 6, 5561);
    			add_location(strong0, file, 163, 8, 5713);
    			add_location(h3, file, 164, 8, 5754);
    			add_location(strong1, file, 170, 10, 5943);
    			add_location(p1, file, 171, 10, 5986);
    			attr_dev(div0, "class", "substeps-details svelte-17ff6a7");
    			add_location(div0, file, 169, 8, 5902);
    			attr_dev(div1, "class", "substeps-list svelte-17ff6a7");
    			add_location(div1, file, 162, 6, 5677);
    			add_location(strong2, file, 179, 8, 6221);
    			add_location(ul, file, 180, 8, 6269);
    			attr_dev(div2, "class", "document-list svelte-17ff6a7");
    			add_location(div2, file, 178, 6, 6185);
    			attr_dev(div3, "class", "step-details svelte-17ff6a7");
    			attr_dev(div3, "aria-live", "polite");
    			add_location(div3, file, 153, 4, 5410);
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
    			append_dev(div3, t11);
    			append_dev(div3, div2);
    			append_dev(div2, strong2);
    			append_dev(div2, t13);
    			append_dev(div2, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 9 && t0_value !== (t0_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].paso + "")) set_data_dev(t0, t0_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 9 && t2_value !== (t2_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].descripcion + "")) set_data_dev(t2, t2_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep, $currentSubStep*/ 11 && t6_value !== (t6_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].subpaso + "")) set_data_dev(t6, t6_value);
    			if (dirty & /*$selectedEmpresaIndex, $currentStep, $currentSubStep, $currentDetailIndex*/ 15 && t10_value !== (t10_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].detalle[/*$currentDetailIndex*/ ctx[2]] + "")) set_data_dev(t10, t10_value);

    			if (dirty & /*empresaData, $selectedEmpresaIndex, $currentStep*/ 9) {
    				each_value = empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].documentos;
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
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(153:2) {#if empresaData.tipos.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (182:10) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].documentos as documento}
    function create_each_block(ctx) {
    	let li;
    	let t_value = /*documento*/ ctx[12] + "";
    	let t;

    	const block = {
    		c: function create() {
    			li = element("li");
    			t = text(t_value);
    			attr_dev(li, "class", "document-list-item svelte-17ff6a7");
    			add_location(li, file, 182, 12, 6389);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$selectedEmpresaIndex, $currentStep*/ 9 && t_value !== (t_value = /*documento*/ ctx[12] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(182:10) {#each empresaData.tipos[$selectedEmpresaIndex].pasos[$currentStep].documentos as documento}",
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
    	let div1;
    	let button0;
    	let t3;
    	let button0_disabled_value;
    	let t4;
    	let button1;
    	let t5;
    	let button1_disabled_value;
    	let t6;
    	let t7;
    	let div3;
    	let shadertoy;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value_1 = empresaData.tipos;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let if_block = empresaData.tipos.length > 0 && create_if_block(ctx);

    	shadertoy = new ShaderToy({
    			props: { shader: VShader },
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
    			div1 = element("div");
    			button0 = element("button");
    			t3 = text("Anterior");
    			t4 = space();
    			button1 = element("button");
    			t5 = text("Siguiente");
    			t6 = space();
    			if (if_block) if_block.c();
    			t7 = space();
    			div3 = element("div");
    			create_component(shadertoy.$$.fragment);
    			attr_dev(label, "for", "empresa-tipo");
    			add_location(label, file, 116, 4, 4345);
    			attr_dev(select, "id", "empresa-tipo");
    			add_location(select, file, 117, 4, 4414);
    			attr_dev(div0, "class", "empresa-selector svelte-17ff6a7");
    			add_location(div0, file, 115, 2, 4310);
    			button0.disabled = button0_disabled_value = /*$currentStep*/ ctx[0] === 0 && /*$currentSubStep*/ ctx[1] === 0 && /*$currentDetailIndex*/ ctx[2] === 0;
    			attr_dev(button0, "class", "svelte-17ff6a7");
    			add_location(button0, file, 128, 4, 4682);
    			button1.disabled = button1_disabled_value = /*$currentStep*/ ctx[0] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos.length - 1 && /*$currentSubStep*/ ctx[1] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos.length - 1 && /*$currentDetailIndex*/ ctx[2] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].detalle.length - 1;
    			attr_dev(button1, "class", "svelte-17ff6a7");
    			add_location(button1, file, 134, 4, 4853);
    			attr_dev(div1, "class", "step-buttons svelte-17ff6a7");
    			add_location(div1, file, 127, 2, 4651);
    			attr_dev(div2, "class", "step-container svelte-17ff6a7");
    			add_location(div2, file, 114, 0, 4279);
    			attr_dev(div3, "class", "shader svelte-17ff6a7");
    			add_location(div3, file, 190, 0, 6509);
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

    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			append_dev(div1, button0);
    			append_dev(button0, t3);
    			append_dev(div1, t4);
    			append_dev(div1, button1);
    			append_dev(button1, t5);
    			append_dev(div2, t6);
    			if (if_block) if_block.m(div2, null);
    			insert_dev(target, t7, anchor);
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
    			if (dirty & /*empresaData*/ 0) {
    				each_value_1 = empresaData.tipos;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (!current || dirty & /*$currentStep, $currentSubStep, $currentDetailIndex*/ 7 && button0_disabled_value !== (button0_disabled_value = /*$currentStep*/ ctx[0] === 0 && /*$currentSubStep*/ ctx[1] === 0 && /*$currentDetailIndex*/ ctx[2] === 0)) {
    				prop_dev(button0, "disabled", button0_disabled_value);
    			}

    			if (!current || dirty & /*$currentStep, $selectedEmpresaIndex, $currentSubStep, $currentDetailIndex*/ 15 && button1_disabled_value !== (button1_disabled_value = /*$currentStep*/ ctx[0] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos.length - 1 && /*$currentSubStep*/ ctx[1] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos.length - 1 && /*$currentDetailIndex*/ ctx[2] === empresaData.tipos[/*$selectedEmpresaIndex*/ ctx[3]].pasos[/*$currentStep*/ ctx[0]].subpasos[/*$currentSubStep*/ ctx[1]].detalle.length - 1)) {
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
    			if (detaching) detach_dev(t7);
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
    	let $currentStep;
    	let $currentSubStep;
    	let $currentDetailIndex;
    	let $selectedEmpresaIndex;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let selectedEmpresaIndex = writable(0);
    	validate_store(selectedEmpresaIndex, 'selectedEmpresaIndex');
    	component_subscribe($$self, selectedEmpresaIndex, value => $$invalidate(3, $selectedEmpresaIndex = value));
    	let currentStep = writable(0);
    	validate_store(currentStep, 'currentStep');
    	component_subscribe($$self, currentStep, value => $$invalidate(0, $currentStep = value));
    	let currentSubStep = writable(0);
    	validate_store(currentSubStep, 'currentSubStep');
    	component_subscribe($$self, currentSubStep, value => $$invalidate(1, $currentSubStep = value));
    	let currentDetailIndex = writable(0);
    	validate_store(currentDetailIndex, 'currentDetailIndex');
    	component_subscribe($$self, currentDetailIndex, value => $$invalidate(2, $currentDetailIndex = value));

    	// Load from localStorage if available
    	onMount(() => {
    		const savedSelectedEmpresaIndex = localStorage.getItem("selectedEmpresaIndex");
    		const savedCurrentStep = localStorage.getItem("currentStep");
    		const savedCurrentSubStep = localStorage.getItem("currentSubStep");
    		const savedCurrentDetailIndex = localStorage.getItem("currentDetailIndex");
    		if (savedSelectedEmpresaIndex !== null) selectedEmpresaIndex.set(+savedSelectedEmpresaIndex);
    		if (savedCurrentStep !== null) currentStep.set(+savedCurrentStep);
    		if (savedCurrentSubStep !== null) currentSubStep.set(+savedCurrentSubStep);
    		if (savedCurrentDetailIndex !== null) currentDetailIndex.set(+savedCurrentDetailIndex);
    	});

    	// Save to localStorage whenever value changes
    	selectedEmpresaIndex.subscribe(value => {
    		localStorage.setItem("selectedEmpresaIndex", String(value));
    	});

    	currentStep.subscribe(value => {
    		localStorage.setItem("currentStep", String(value));
    	});

    	currentSubStep.subscribe(value => {
    		localStorage.setItem("currentSubStep", String(value));
    	});

    	currentDetailIndex.subscribe(value => {
    		localStorage.setItem("currentDetailIndex", String(value));
    	});

    	function nextDetail() {
    		const currentDetailIndexValue = get_store_value(currentDetailIndex);
    		const currentSubStepValue = get_store_value(currentSubStep);
    		const currentStepValue = get_store_value(currentStep);
    		const selectedEmpresaIndexValue = get_store_value(selectedEmpresaIndex);
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
    		// Get current values
    		let currentDetailIndexValue = get_store_value(currentDetailIndex);

    		let currentSubStepValue = get_store_value(currentSubStep);
    		let currentStepValue = get_store_value(currentStep);
    		let selectedEmpresaIndexValue = get_store_value(selectedEmpresaIndex);

    		if (currentDetailIndexValue > 0) {
    			// Decrement detail index if possible
    			currentDetailIndex.update(n => n - 1);
    		} else if (currentSubStepValue > 0) {
    			// Decrement sub-step index
    			const newSubStepValue = currentSubStepValue - 1;

    			currentSubStep.set(newSubStepValue);

    			// Access the updated sub-step
    			const subpasos = empresaData.tipos[selectedEmpresaIndexValue].pasos[currentStepValue].subpasos;

    			const detalleLength = subpasos[newSubStepValue].detalle.length;

    			// Set detail index to the last item of the new sub-step
    			currentDetailIndex.set(detalleLength - 1);
    		} else if (currentStepValue > 0) {
    			// Decrement step index
    			const newStepValue = currentStepValue - 1;

    			currentStep.set(newStepValue);

    			// Access the updated step and get the last sub-step
    			const pasos = empresaData.tipos[selectedEmpresaIndexValue].pasos;

    			const subpasos = pasos[newStepValue].subpasos;
    			const newSubStepIndex = subpasos.length - 1;
    			currentSubStep.set(newSubStepIndex);

    			// Set detail index to the last item of the last sub-step
    			const detalleLength = subpasos[newSubStepIndex].detalle.length;

    			currentDetailIndex.set(detalleLength - 1);
    		}
    	} // If none of the above, we're at the very beginning and do nothing

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
    		writable,
    		get: get_store_value,
    		onMount,
    		empresaData,
    		ShaderToy,
    		VShader,
    		selectedEmpresaIndex,
    		currentStep,
    		currentSubStep,
    		currentDetailIndex,
    		nextDetail,
    		previousStep,
    		updateSteps,
    		$currentStep,
    		$currentSubStep,
    		$currentDetailIndex,
    		$selectedEmpresaIndex
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
    		$currentStep,
    		$currentSubStep,
    		$currentDetailIndex,
    		$selectedEmpresaIndex,
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
