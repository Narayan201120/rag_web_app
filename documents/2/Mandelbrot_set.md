The Mandelbrot set ( / ˈ m æ n d əl b r oʊ t , - b r ɒ t / ) is a two-dimensional set that is defined in the complex plane as the complex numbers $c$ for which the function $f_{c}(z)=z^{2}+c$ does not diverge to infinity when iterated starting at $z=0$ , i.e., for which the sequence $f_{c}(0)$ , $f_{c}(f_{c}(0))$ , etc., remains bounded in absolute value .

This set was first defined and drawn by Robert W. Brooks and Peter Matelski in 1978, as part of a study of Kleinian groups . Afterwards, in 1980, Benoit Mandelbrot obtained high-quality visualizations of the set while working at IBM 's Thomas J. Watson Research Center in Yorktown Heights, New York .

Images of the Mandelbrot set exhibit an infinitely complicated boundary that reveals progressively ever-finer recursive detail at increasing magnifications; mathematically, the boundary of the Mandelbrot set is a fractal curve . The "style" of this recursive detail depends on the region of the set boundary being examined. Images of the Mandelbrot set are created by determining whether the sequence $f_{c}(0),f_{c}(f_{c}(0)),\dotsc$ goes to infinity for each sampled complex number c. The real and imaginary parts of $c$ are mapped as image coordinates on the complex plane and coloured based on the point at which the sequence $|f_{c}(0)|,|f_{c}(f_{c}(0))|,\dotsc$ crosses an arbitrary threshold. If $c$ is held constant and the initial value of $z$ is varied instead, the corresponding Julia set for the point $c$ is obtained.

The Mandelbrot set is well-known, even outside mathematics, for how it exhibits complex fractal structures when visualized and magnified, despite having a relatively simple definition, and is commonly cited as an example of mathematical beauty .

## History

The Mandelbrot set has its origin in complex dynamics , a field first investigated by the French mathematicians Pierre Fatou and Gaston Julia at the beginning of the 20th century. The fractal was first defined and drawn in 1978 by Robert W. Brooks and Peter Matelski as part of a study of Kleinian groups . On 1 March 1980, at IBM 's Thomas J. Watson Research Center in Yorktown Heights, New York , Benoit Mandelbrot first visualized the set.

Mandelbrot studied the parameter space of quadratic polynomials in an article that appeared in 1980. The mathematical study of the Mandelbrot set really began with work by the mathematicians Adrien Douady and John H. Hubbard (1985), who established many of its fundamental properties and named the set in honor of Mandelbrot for his influential work in fractal geometry .

The mathematicians Heinz-Otto Peitgen and Peter Richter became well known for promoting the set with photographs, books (1986), and an internationally touring exhibit of the German Goethe-Institut (1985).

The cover article of the August 1985 Scientific American introduced the algorithm for computing the Mandelbrot set. The cover was created by Peitgen, Richter and Saupe at the University of Bremen . The Mandelbrot set became prominent in the mid-1980s as a computer-graphics demo , when personal computers became powerful enough to plot and display the set in high resolution.

The work of Douady and Hubbard occurred during an increase in interest in complex dynamics and abstract mathematics , and the topological and geometric study of the Mandelbrot set remains a key topic in the field of complex dynamics.

## Formal definition

The Mandelbrot set is the uncountable set of values of c in the complex plane for which the orbit of the critical point under iteration of the quadratic map

remains bounded . Thus, a complex number c is a member of the Mandelbrot set if, when starting with $z_{0}=0$ and applying the iteration repeatedly, the absolute value of $z_{n}$ remains bounded for all $n>0$ .

For example, for c = 1, the sequence is 0, 1, 2, 5, 26, ..., which tends to infinity , so 1 is not an element of the Mandelbrot set. On the other hand, for $c=-1$ , the sequence is 0, −1, 0, −1, 0, ..., which is bounded, so −1 does belong to the set.

The Mandelbrot set can also be defined as the connectedness locus of the family of quadratic polynomials $f(z)=z^{2}+c$ , the subset of the space of parameters $c$ for which the Julia set of the corresponding polynomial forms a connected set . In the same way, the boundary of the Mandelbrot set can be defined as the bifurcation locus of this quadratic family, the subset of parameters near which the dynamic behavior of the polynomial (when it is iterated repeatedly) changes drastically.

## Basic properties

The Mandelbrot set is a compact set , since it is closed and contained in the closed disk of radius 2 centred on zero . A point $c$ belongs to the Mandelbrot set if and only if $|z_{n}|\leq 2$ for all $n\geq 0$ . In other words, the absolute value of $z_{n}$ must remain at or below 2 for $c$ to be in the Mandelbrot set, $M$ , and if that absolute value exceeds 2, the sequence will escape to infinity. Since $c=z_{1}$ , it follows that $|c|\leq 2$ , establishing that $c$ will always be in the closed disk of radius 2 around the origin.

The intersection of $M$ with the real axis is the interval $\left[-2,{\frac {1}{4}}\right]$ . The parameters along this interval can be put in one-to-one correspondence with those of the real logistic family ,

The correspondence is given by

This gives a correspondence between the entire parameter space of the logistic family and that of the Mandelbrot set.

Douady and Hubbard showed that the Mandelbrot set is connected . They constructed an explicit conformal isomorphism between the complement of the Mandelbrot set and the complement of the closed unit disk . Mandelbrot had originally conjectured that the Mandelbrot set is disconnected . This conjecture was based on computer pictures generated by programs that are unable to detect the thin filaments connecting different parts of $M$ . Upon further experiments, he revised his conjecture, deciding that $M$ should be connected. A topological proof of the connectedness was discovered in 2001 by Jeremy Kahn .

The dynamical formula for the uniformisation of the complement of the Mandelbrot set, arising from Douady and Hubbard's proof of the connectedness of $M$ , gives rise to external rays of the Mandelbrot set. These rays can be used to study the Mandelbrot set in combinatorial terms and form the backbone of the Yoccoz parapuzzle .

The boundary of the Mandelbrot set is the bifurcation locus of the family of quadratic polynomials. In other words, the boundary of the Mandelbrot set is the set of all parameters $c$ for which the dynamics of the quadratic map $z_{n}=z_{n-1}^{2}+c$ exhibits sensitive dependence on $c,$ i.e. changes abruptly under arbitrarily small changes of $c.$ It can be constructed as the limit set of a sequence of plane algebraic curves , the Mandelbrot curves , of the general type known as polynomial lemniscates . The Mandelbrot curves are defined by setting $p_{0}=z,\ p_{n+1}=p_{n}^{2}+z$ , and then interpreting the set of points $|p_{n}(z)|=2$ in the complex plane as a curve in the real Cartesian plane of degree $2^{n+1}$ in x and y . Each curve $n>0$ is the mapping of an initial circle of radius 2 under $p_{n}$ . These algebraic curves appear in images of the Mandelbrot set computed using the "escape time algorithm" mentioned below.

## Other properties

### Main cardioid and period bulbs

The main cardioid is the period 1 continent. It is the region of parameters $c$ for which the map $f_{c}(z)=z^{2}+c$ has an attracting fixed point . The set comprises all parameters of the form $c(\mu ):={\frac {\mu }{2}}\left(1-{\frac {\mu }{2}}\right)$ where $\mu$ lies within the open unit disk .

Attached to the left of the main cardioid at the point $c=-3/4$ , the period-2 bulb is visible. This region consists of values of $c$ for which $f_{c}$ has an attracting cycle of period 2 . It is the filled circle of radius 1/4 centered around −1.

More generally, for every positive integer $q>2$ , there are $\phi (q)$ circular bulbs tangent to the main cardioid called period-q bulbs (where $\phi$ denotes the Euler phi function ), which consist of parameters $c$ for which $f_{c}$ has an attracting cycle of period $q$ . [ citation needed ] More specifically, for each primitive $q$ th root of unity $r=e^{2\pi i{\frac {p}{q}}}$ (where $0<{\frac {p}{q}}<1$ ), there is one period-q bulb called the ${\frac {p}{q}}$ bulb, which is tangent to the main cardioid at the parameter $c_{\frac {p}{q}}:=c(r)={\frac {r}{2}}\left(1-{\frac {r}{2}}\right),$ and which contains parameters with $q$ -cycles having combinatorial rotation number ${\frac {p}{q}}$ . The $q$ periodic Fatou components containing the attracting cycle meet at the $\alpha$ -fixed point . If these are labelled counterclockwise as $U_{0},\dots ,U_{q-1}$ , then component $U_{j}$ is mapped by $f_{c}$ to the component $U_{j+p\,(\operatorname {mod} q)}$ .

### Hyperbolic components

Bulbs that are interior components of the Mandelbrot set in which the maps $f_{c}$ have an attracting periodic cycle are called hyperbolic components .

It is conjectured that these are the only interior regions of $M$ and that they are dense in $M$ . This problem, known as density of hyperbolicity , is one of the most important open problems in complex dynamics . Hypothetical non-hyperbolic components of the Mandelbrot set are often referred to as "queer" or ghost components. For real quadratic polynomials, this question was proved in the 1990s independently by Lyubich and by Graczyk and Świątek. (Note that hyperbolic components intersecting the real axis correspond exactly to periodic windows in the Feigenbaum diagram . So this result states that such windows exist near every parameter in the diagram.)

Not every hyperbolic component can be reached by a sequence of direct bifurcations from the main cardioid of the Mandelbrot set. Such a component can be reached by a sequence of direct bifurcations from the main cardioid of a little Mandelbrot copy (see below).

Each of the hyperbolic components has a center , which is a point c such that the inner Fatou domain for $f_{c}(z)$ has a super-attracting cycle-that is, that the attraction is infinite. This means that the cycle contains the critical point 0, so that 0 is iterated back to itself after some iterations. Therefore, $f_{c}^{n}(0)=0$ for some n . If we call this polynomial $Q^{n}(c)$ (letting it depend on c instead of z ), we have that $Q^{n+1}(c)=Q^{n}(c)^{2}+c$ and that the degree of $Q^{n}(c)$ is $2^{n-1}$ . Therefore, constructing the centers of the hyperbolic components is possible by successively solving the equations $Q^{n}(c)=0,n=1,2,3,...$ . [ citation needed ] The number of new centers produced in each step is given by Sloane's (sequence A000740 in the OEIS ).

### Local connectivity

It is conjectured that the Mandelbrot set is locally connected . This conjecture is known as MLC (for Mandelbrot locally connected ). By the work of Adrien Douady and John H. Hubbard , this conjecture would result in a simple abstract "pinched disk" model of the Mandelbrot set. In particular, it would imply the important hyperbolicity conjecture mentioned above. [ citation needed ]

The work of Jean-Christophe Yoccoz established local connectivity of the Mandelbrot set at all finitely renormalizable parameters; that is, roughly speaking those contained only in finitely many small Mandelbrot copies. Since then, local connectivity has been proved at many other points of $M$ , but the full conjecture is still open.

### Self-similarity

The Mandelbrot set is self-similar under magnification in the neighborhoods of the Misiurewicz points . It is also conjectured to be self-similar around generalized Feigenbaum points (e.g., −1.401155 or −0.1528 + 1.0397 i ), in the sense of converging to a limit set. The Mandelbrot set in general is quasi-self-similar, as small slightly different versions of itself can be found at arbitrarily small scales. These copies of the Mandelbrot set are all slightly different, mostly because of the thin threads connecting them to the main body of the set.

### Further results

The Hausdorff dimension of the boundary of the Mandelbrot set equals 2 as determined by a result of Mitsuhiro Shishikura . The fact that this is greater by a whole integer than its topological dimension, which is 1, reflects the extreme fractal nature of the Mandelbrot set boundary. Roughly speaking, Shishikura's result states that the Mandelbrot set boundary is so "wiggly" that it locally fills space as efficiently as a two-dimensional planar region. Curves with Hausdorff dimension 2, despite being (topologically) 1-dimensional, are oftentimes capable of having nonzero area (more formally, a nonzero planar Lebesgue measure ). Whether this is the case for the Mandelbrot set boundary is an unsolved problem. [ citation needed ]

It has been shown that the generalized Mandelbrot set in higher-dimensional hypercomplex number spaces (i.e. when the power $\alpha$ of the iterated variable $z$ tends to infinity) is convergent to the unit ( $\alpha$ −1)-sphere.

In the Blum-Shub-Smale model of real computation , the Mandelbrot set is not computable, but its complement is computably enumerable . Many simple objects (e.g., the graph of exponentiation) are also not computable in the BSS model. At present, it is unknown whether the Mandelbrot set is computable in models of real computation based on computable analysis , which correspond more closely to the intuitive notion of "plotting the set by a computer". Hertling has shown that the Mandelbrot set is computable in this model if the hyperbolicity conjecture is true. [ citation needed ]

### Relationship with Julia sets

As a consequence of the definition of the Mandelbrot set, there is a close correspondence between the geometry of the Mandelbrot set at a given point and the structure of the corresponding Julia set . For instance, a value of c belongs to the Mandelbrot set if and only if the corresponding Julia set is connected. Thus, the Mandelbrot set may be seen as a map of the connected Julia sets. [ better source needed ]

This principle is exploited in virtually all deep results on the Mandelbrot set. For example, Shishikura proved that, for a dense set of parameters in the boundary of the Mandelbrot set, the Julia set has Hausdorff dimension two, and then transfers this information to the parameter plane. Similarly, Yoccoz first proved the local connectivity of Julia sets, before establishing it for the Mandelbrot set at the corresponding parameters.

## Geometry

For every rational number ${\tfrac {p}{q}}$ , where p and q are coprime , a hyperbolic component of period q bifurcates from the main cardioid at a point on the edge of the cardioid corresponding to an internal angle of ${\tfrac {2\pi p}{q}}$ . The part of the Mandelbrot set connected to the main cardioid at this bifurcation point is called the p / q -limb . Computer experiments suggest that the diameter of the limb tends to zero like ${\tfrac {1}{q^{2}}}$ . The best current estimate known is the Yoccoz-inequality, which states that the size tends to zero like ${\tfrac {1}{q}}$ . [ citation needed ]

A period- q limb will have $q-1$ "antennae" at the top of its limb. The period of a given bulb is determined by counting these antennas. The numerator of the rotation number, p , is found by numbering each antenna counterclockwise from the limb from 1 to $q-1$ and finding which antenna is the shortest.

### Pi in the Mandelbrot set

There are intriguing experiments in the Mandelbrot set that lead to the occurrence of the number $\pi$ . For a parameter $c=-{\tfrac {3}{4}}+i\varepsilon$ with $\varepsilon >0$ , verifying that $c$ is not in the Mandelbrot set means iterating the sequence $z\mapsto z^{2}+c$ starting with $z=0$ , until the sequence leaves the disk around $0$ of any radius $R>2$ . This is motivated by the (still open) question whether the vertical line at real part $-3/4$ intersects the Mandelbrot set at points away from the real line. It turns out that the necessary number of iterations, multiplied by $\varepsilon$ , converges to pi. For example, for $\varepsilon$ = 0.0000001, and $R=2$ , the number of iterations is 31415928 and the product is 3.1415928. This experiment was performed independently by many people in the early 1990s, if not before; for instance by David Boll.

Analogous observations have also been made at the parameters $c=-5/4$ and $c=1/4$ (with a necessary modification in the latter case). In 2001, Aaron Klebanoff published a (non-conceptual) proof for this phenomenon at $c=1/4$

In 2023, Paul Siewert developed, in his Bachelor thesis, a conceptual proof also for the value $c=1/4$ , explaining why the number pi occurs (geometrically as half the circumference of the unit circle).

In 2025, the three high school students Thies Brockmöller, Oscar Scherz, and Nedim Srkalovic extended the theory and the conceptual proof to all the infinitely many bifurcation points in the Mandelbrot set.

### Fibonacci sequence in the Mandelbrot set

The Mandelbrot Set features a fundamental cardioid shape adorned with numerous bulbs directly attached to it. Understanding the arrangement of these bulbs requires a detailed examination of the Mandelbrot Set's boundary. As one zooms into specific portions with a geometric perspective, precise deducible information about the location within the boundary and the corresponding dynamical behavior for parameters drawn from associated bulbs emerges.

The iteration of the quadratic polynomial $f_{c}(z)=z^{2}+c$ , where $c$ is a parameter drawn from one of the bulbs attached to the main cardioid within the Mandelbrot Set, gives rise to maps featuring attracting cycles of a specified period $q$ and a rotation number $p/q$ . In this context, the attracting cycle of exhibits rotational motion around a central fixed point, completing an average of $p/q$ revolutions at each iteration.

The bulbs within the Mandelbrot Set are distinguishable by both their attracting cycles and the geometric features of their structure. Each bulb is characterized by an antenna attached to it, emanating from a junction point and displaying a certain number of spokes indicative of its period. For instance, the $2/5$ bulb is identified by its attracting cycle with a rotation number of $2/5$ . Its distinctive antenna-like structure comprises a junction point from which five spokes emanate. Among these spokes, called the principal spoke is directly attached to the $2/5$ bulb, and the 'smallest' non-principal spoke is positioned approximately $2/5$ of a turn counterclockwise from the principal spoke, providing a distinctive identification as a $2/5$ -bulb. This raises the question: how does one discern which among these spokes is the 'smallest'? In the theory of external rays developed by Douady and Hubbard , there are precisely two external rays landing at the root point of a satellite hyperbolic component of the Mandelbrot Set. Each of these rays possesses an external angle that undergoes doubling under the angle doubling map $\theta \mapsto$ $2\theta$ . According to this theorem, when two rays land at the same point, no other rays between them can intersect. Thus, the 'size' of this region is measured by determining the length of the arc between the two angles.

If the root point of the main cardioid is the cusp at $c=1/4$ , then the main cardioid is the $0/1$ -bulb. The root point of any other bulb is just the point where this bulb is attached to the main cardioid. This prompts the inquiry: which is the largest bulb between the root points of the $0/1$ and $1/2$ -bulbs? It is clearly the $1/3$ -bulb. And note that $1/3$ is obtained from the previous two fractions by Farey addition , i.e., adding the numerators and adding the denominators

${\frac {0}{1}}$ $\oplus$ ${\frac {1}{2}}$ $=$ ${\frac {1}{3}}$

Similarly, the largest bulb between the $1/3$ and $1/2$ -bulbs is the $2/5$ -bulb, again given by Farey addition.

${\frac {1}{3}}$ $\oplus$ ${\frac {1}{2}}$ $=$ ${\frac {2}{5}}$

The largest bulb between the $2/5$ and $1/2$ -bulb is the $3/7$ -bulb, while the largest bulb between the $2/5$ and $1/3$ -bulbs is the $3/8$ -bulb, and so on. The arrangement of bulbs within the Mandelbrot set follows a remarkable pattern governed by the Farey tree , a structure encompassing all rationals between $0$ and $1$ . This ordering positions the bulbs along the boundary of the main cardioid precisely according to the rational numbers in the unit interval .

Starting with the $1/3$ bulb at the top and progressing towards the $1/2$ circle, the sequence unfolds systematically: the largest bulb between $1/2$ and $1/3$ is $2/5$ , between $1/3$ and $2/5$ is $3/8$ , and so forth. Intriguingly, the denominators of the periods of circular bulbs at sequential scales in the Mandelbrot Set conform to the Fibonacci number sequence , the sequence that is made by adding the previous two terms - 1, 2, 3, 5, 8, 13, 21...

The Fibonacci sequence manifests in the number of spiral arms at a unique spot on the Mandelbrot set, mirrored both at the top and bottom. This distinctive location demands the highest number of iterations of for a detailed fractal visual, with intricate details repeating as one zooms in.

### Image gallery of a zoom sequence

The boundary of the Mandelbrot set shows more intricate detail the closer one looks or magnifies the image. The following is an example of an image sequence zooming to a selected c value. The area shown is known as the "seahorse valley", which is a region of the Mandelbrot set centred on the point −0.75 + 0.1 i .

The magnification of the last image relative to the first one is about 10 10 to 1. Relating to an ordinary computer monitor , it represents a section of a Mandelbrot set with a diameter of 4 million kilometers.

- Start. Mandelbrot set with continuously colored environment.

- Gap between the "head" and the "body", also called the "seahorse valley"

- Double-spirals on the left, "seahorses" on the right

- "Seahorse" upside down

The seahorse "body" is composed by 25 "spokes" consisting of two groups of 12 "spokes" each and one "spoke" connecting to the main cardioid. These two groups can be attributed by some metamorphosis to the two "fingers" of the "upper hand" of the Mandelbrot set; therefore, the number of "spokes" increases from one "seahorse" to the next by 2; the "hub" is a Misiurewicz point . Between the "upper part of the body" and the "tail", there is a distorted copy of the Mandelbrot set, called a "satellite".

- The central endpoint of the "seahorse tail" is also a Misiurewicz point .

- Part of the "tail" - there is only one path consisting of the thin structures that lead through the whole "tail". This zigzag path passes the "hubs" of the large objects with 25 "spokes" at the inner and outer border of the "tail"; thus the Mandelbrot set is a simply connected set, which means there are no islands and no loop roads around a hole.

- Satellite. The two "seahorse tails" (also called dendritic structures ) are the beginning of a series of concentric crowns with the satellite in the center.

- Each of these crowns consists of similar "seahorse tails"; their number increases with powers of 2, a typical phenomenon in the environment of satellites. The unique path to the spiral center passes the satellite from the groove of the cardioid to the top of the "antenna" on the "head".

- "Antenna" of the satellite. There are several satellites of second order.

- The "seahorse valley" of the satellite. All the structures from the start reappear.

- Double-spirals and "seahorses" - unlike the second image from the start, they have appendices consisting of structures like "seahorse tails"; this demonstrates the typical linking of n + 1 different structures in the environment of satellites of the order n , here for the simplest case n = 1.

- Double-spirals with satellites of second order - analogously to the "seahorses", the double-spirals may be interpreted as a metamorphosis of the "antenna".

- In the outer part of the appendices, islands of structures may be recognized; they have a shape like Julia sets J c ; the largest of them may be found in the center of the "double-hook" on the right side.

- Part of the "double-hook".

- Islands.

- A detail of one island.

- Detail of the spiral.

The islands in the third-to-last step seem to consist of infinitely many parts, as is the case for the corresponding Julia set $J_{c}$ . They are connected by tiny structures, so that the whole represents a simply connected set. The tiny structures meet each other at a satellite in the center that is too small to be recognized at this magnification. The value of $c$ for the corresponding $J_{c}$ is not the image center but, relative to the main body of the Mandelbrot set, has the same position as the center of this image relative to the satellite shown in the 6th step.

### Inner structure

While the Mandelbrot set is typically rendered showing outside boundary detail, structure within the bounded set can also be revealed. For example, while calculating whether or not a given c value is bound or unbound, while it remains bound, the maximum value that this number reaches can be compared to the c value at that location. If the sum of squares method is used, the calculated number would be max:(real^2 + imaginary^2) − c:(real^2 + imaginary^2). [ citation needed ] The magnitude of this calculation can be rendered as a value on a gradient.

This produces results like the following, gradients with distinct edges and contours as the boundaries are approached. The animations serve to highlight the gradient boundaries.

- Animated gradient structure inside the Mandelbrot set

- Animated gradient structure inside the Mandelbrot set, detail

- Rendering of progressive iterations from 285 to approximately 200,000 with corresponding bounded gradients animated

- Thumbnail for gradient in progressive iterations

## Generalizations

### Multibrot sets

Multibrot sets are bounded sets found in the complex plane for members of the general monic univariate polynomial family of recursions

For an integer d , these sets are connectedness loci for the Julia sets built from the same formula. The full cubic connectedness locus has also been studied; here one considers the two-parameter recursion $z\mapsto z^{3}+3kz+c$ , whose two critical points are the complex square roots of the parameter k . A parameter is in the cubic connectedness locus if both critical points are stable. For general families of holomorphic functions , the boundary of the Mandelbrot set generalizes to the bifurcation locus . [ citation needed ]

The Multibrot set is obtained by varying the value of the exponent d . The article has a video that shows the development from d = 0 to 7, at which point there are 6 i.e. $(d-1)$ lobes around the perimeter . In general, when d is a positive integer, the central region in each of these sets is always an epicycloid of $(d-1)$ cusps. A similar development with negative integral exponents results in $(1-d)$ clefts on the inside of a ring, where the main central region of the set is a hypocycloid of $(1-d)$ cusps. [ citation needed ]

### Higher dimensions

There is no perfect extension of the Mandelbrot set into 3D, because there is no 3D analogue of the complex numbers for it to iterate on. There is an extension of the complex numbers into 4 dimensions, the quaternions , that creates a perfect extension of the Mandelbrot set and the Julia sets into 4 dimensions. These can then be either cross-sectioned or projected into a 3D structure. The quaternion (4-dimensional) Mandelbrot set is simply a solid of revolution of the 2-dimensional Mandelbrot set (in the j-k plane), and is therefore uninteresting to look at. Taking a 3-dimensional cross section at $d=0\ (q=a+bi+cj+dk)$ results in a solid of revolution of the 2-dimensional Mandelbrot set around the real axis. [ citation needed ]

### Other non-analytic mappings

The tricorn fractal , also called the Mandelbar set , is the connectedness locus of the anti-holomorphic family $z\mapsto {\bar {z}}^{2}+c$ . It was encountered by Milnor in his study of parameter slices of real cubic polynomials . [ citation needed ] It is not locally connected. This property is inherited by the connectedness locus of real cubic polynomials. [ citation needed ]

Another non-analytic generalization is the Burning Ship fractal , which is obtained by iterating the following:

## Computer drawings

There exist a multitude of various algorithms for plotting the Mandelbrot set via a computing device. Here, the naïve "escape time algorithm" will be shown, since it is the most popular and one of the simplest algorithms. In the escape time algorithm, a repeating calculation is performed for each x , y point in the plot area and based on the behavior of that calculation, a color is chosen for that pixel.

The x and y locations of each point are used as starting values in a repeating, or iterating calculation (described in detail below). The result of each iteration is used as the starting values for the next. The values are checked during each iteration to see whether they have reached a critical "escape" condition, or "bailout". If that condition is reached, the calculation is stopped, the pixel is drawn, and the next x , y point is examined.

The color of each point represents how quickly the values reached the escape point. Often black is used to show values that fail to escape before the iteration limit, and gradually brighter colors are used for points that escape. This gives a visual representation of how many cycles were required before reaching the escape condition.

To render such an image, the region of the complex plane we are considering is subdivided into a certain number of pixels . To color any such pixel, let $c$ be the midpoint of that pixel. Iterate the critical point 0 under $f_{c}$ , checking at each step whether the orbit point has a radius larger than 2. When this is the case, $c$ does not belong to the Mandelbrot set, and color the pixel according to the number of iterations used to find out. Otherwise, keep iterating up to a fixed number of steps, after which we decide that our parameter is "probably" in the Mandelbrot set, or at least very close to it, and color the pixel black.

In pseudocode , this algorithm would look as follows. The algorithm does not use complex numbers and manually simulates complex-number operations using two real numbers, for those who do not have a complex data type . The program may be simplified if the programming language includes complex-data-type operations.

```
for each pixel (Px, Py) on the screen do x0 := scaled x coordinate of pixel (scaled to lie in the Mandelbrot X scale (-2.00, 0.47))
y0 := scaled y coordinate of pixel (scaled to lie in the Mandelbrot Y scale (-1.12, 1.12))
x := 0.0
y := 0.0
iteration := 0
max_iteration := 1000 while (x^2 + y^2 ≤ 2^2 AND iteration < max_iteration) do xtemp := x^2 - y^2 + x0
y := 2*x*y + y0
x := xtemp
iteration := iteration + 1
color := palette[iteration]
plot(Px, Py, color)
```

Here, relating the pseudocode to $c$ , $z$ and $f_{c}$ :

- $z=x+iy$

- $z^{2}=x^{2}+i2xy-y^{2}$

- $c=x_{0}+iy_{0}$

and so, as can be seen in the pseudocode in the computation of x and y :

- $x=\mathop {\mathrm {Re} } \left(z^{2}+c\right)=x^{2}-y^{2}+x_{0}$ and $y=\mathop {\mathrm {Im} } \left(z^{2}+c\right)=2xy+y_{0}$ .

To get colorful images of the set, the assignment of a color to each value of the number of executed iterations can be made using one of a variety of functions (linear, exponential, etc.).

### Python code

Here is the code implementing the above algorithm in Python :

```
import numpy as np import matplotlib.pyplot as plt # Setting parameters (these values can be changed) x_domain , y_domain = np . linspace ( - 2 , 2 , 500 ), np . linspace ( - 2 , 2 , 500 ) bound = 2 max_iterations = 50 # any positive integer value colormap = "nipy_spectral" # set to any matplotlib valid colormap func = lambda z , p , c : z ** p + c # Computing 2D array to represent the Mandelbrot set iteration_array = [] for y in y_domain : row = [] for x in x_domain : z = 0 p = 2 c = complex ( x , y ) for iteration_number in range ( max_iterations ): if abs ( z ) >= bound : row . append ( iteration_number ) break else : try : z = func ( z , p , c ) except ( ValueError , ZeroDivisionError ): z = c else : row . append ( 0 ) iteration_array . append ( row ) # Plotting the data ax = plt . axes () ax . set_aspect ( "equal" ) graph = ax . pcolormesh ( x_domain , y_domain , iteration_array , cmap = colormap ) plt . colorbar ( graph ) plt . xlabel ( "Real-Axis" ) plt . ylabel ( "Imaginary-Axis" ) plt . show ()
```

The value of power variable can be modified to generate an image of equivalent multibrot set ( $z=z^{\text{power}}+c$ ). For example, setting p = 2 produces the associated image.

## See also

- Buddhabrot

- Collatz fractal

- Fractint

- Gilbreath permutation

- List of mathematical art software

- Mandelbox

- Mandelbulb

- Menger sponge

- Newton fractal

- Orbit portrait

- Orbit trap

- Pickover stalk

- Plotting algorithms for the Mandelbrot set

- Weierstrass-Mandelbrot function

## References

1. ^ "Mandelbrot set" . Lexico UK English Dictionary . Oxford University Press . Archived from the original on 31 January 2022.

1. ^ "Mandelbrot set" . Merriam-Webster.com Dictionary . Merriam-Webster. OCLC 1032680871 . Retrieved 30 January 2022 .

1. ^ Cooper, S. B.; Löwe, Benedikt; Sorbi, Andrea (28 November 2007). New Computational Paradigms: Changing Conceptions of What is Computable . Springer Science & Business Media. p. 450. ISBN 978-0-387-68546-5 .

1. ^ a b Robert Brooks and Peter Matelski, The dynamics of 2-generator subgroups of PSL(2,C) , in Irwin Kra (1981). Irwin Kra (ed.). Riemann Surfaces and Related Topics: Proceedings of the 1978 Stony Brook Conference (PDF) . Bernard Maskit . Princeton University Press. ISBN 0-691-08267-7 . Archived from the original (PDF) on 28 July 2019 . Retrieved 1 July 2019 .

1. ^ Nakos, George (20 May 2024). Elementary Linear Algebra with Applications: MATLAB®, Mathematica® and MaplesoftTM . Walter de Gruyter GmbH & Co KG. p. 322. ISBN 978-3-11-133185-0 .

1. ^ Addison, Paul S. (1 January 1997). Fractals and Chaos: An illustrated course . CRC Press. p. 110. ISBN 978-0-8493-8443-1 .

1. ^ Briggs, John (1992). Fractals: The Patterns of Chaos : a New Aesthetic of Art, Science, and Nature . Simon and Schuster. p. 77. ISBN 978-0-671-74217-1 .

1. ^ Hewson, Stephen Fletcher (2009). A Mathematical Bridge: An Intuitive Journey in Higher Mathematics . World Scientific. p. 155. ISBN 978-981-283-407-2 .

1. ^ Peitgen, Heinz-Otto; Richter, Peter H. (1 December 2013). The Beauty of Fractals: Images of Complex Dynamical Systems . Springer Science & Business Media. p. 166. ISBN 978-3-642-61717-1 . the Mandelbrot set is very diverse in its different regions

1. ^ a b Hunt, John (1 October 2023). Advanced Guide to Python 3 Programming . Springer Nature. p. 117. ISBN 978-3-031-40336-1 .

1. ^ Campuzano, Juan Carlos Ponce (20 November 2020). "Complex Analysis" . Complex Analysis - The Mandelbrot Set . Archived from the original on 16 October 2024 . Retrieved 5 March 2025 .

1. ^ Oberguggenberger, Michael; Ostermann, Alexander (24 October 2018). Analysis for Computer Scientists: Foundations, Methods, and Algorithms . Springer. p. 131. ISBN 978-3-319-91155-7 .

1. ^ "Mandelbrot Set" . cometcloud.sci.utah.edu . Retrieved 22 March 2025 .

1. ^ Peitgen, Heinz-Otto; Jürgens, Hartmut; Saupe, Dietmar (6 December 2012). Fractals for the Classroom: Part Two: Complex Systems and Mandelbrot Set . Springer Science & Business Media. p. 415. ISBN 978-1-4612-4406-6 .

1. ^ Gulick, Denny; Ford, Jeff (10 May 2024). Encounters with Chaos and Fractals . CRC Press. pp. §7.2. ISBN 978-1-003-83578-3 .

1. ^ Bialynicki-Birula, Iwo; Bialynicka-Birula, Iwona (21 October 2004). Modeling Reality: How Computers Mirror Life . OUP Oxford. p. 80. ISBN 978-0-19-853100-5 .

1. ^ R.P. Taylor & J.C. Sprott (2008). "Biophilic Fractals and the Visual Journey of Organic Screen-savers" (PDF) . Nonlinear Dynamics, Psychology, and Life Sciences . 12 (1). Society for Chaos Theory in Psychology & Life Sciences: 117- 129. PMID 18157930 . Retrieved 1 January 2009 .

1. ^ Mandelbrot, Benoit (1980). "Fractal aspects of the iteration of $z\mapsto \lambda z(1-z)$ for complex $\lambda ,z$ ". Annals of the New York Academy of Sciences . 357 (1): 249- 259. doi : 10.1111/j.1749-6632.1980.tb29690.x . S2CID 85237669 .

1. ^ Adrien Douady and John H. Hubbard, Etude dynamique des polynômes complexes , Prépublications mathémathiques d'Orsay 2/4 (1984 / 1985)

1. ^ Peitgen, Heinz-Otto; Richter Peter (1986). The Beauty of Fractals . Heidelberg: Springer-Verlag. ISBN 0-387-15851-0 .

1. ^ Frontiers_of_Chaos , Exhibition of the Goethe-Institut by H.O. Peitgen, P. Richter, H. Jürgens, M. Prüfer, D.Saupe. Since 1985 shown in over 40 countries.

1. ^ Gleick, James (1987). Chaos: Making a New Science . London: Cardinal. p. 229.

1. ^ "Exploring The Mandelbrot Set" . Scientific American . 253 (2): 4. August 1985. JSTOR 24967754 .

1. ^ Pountain, Dick (September 1986). "Turbocharging Mandelbrot" . Byte . Retrieved 11 November 2015 .

1. ^ Rees, Mary (January 2016). "One hundred years of complex dynamics" . Proceedings of the Royal Society A: Mathematical, Physical and Engineering Sciences . 472 (2185). Bibcode : 2016RSPSA.47250453R . doi : 10.1098/rspa.2015.0453 . PMC 4786033 . PMID 26997888 .

1. ^ Schleicher, Dierk (3 November 2009). Complex Dynamics: Families and Friends . CRC Press. pp. xii. ISBN 978-1-4398-6542-2 .

1. ^ Weisstein, Eric W. "Mandelbrot Set" . mathworld.wolfram.com . Retrieved 24 January 2024 .

1. ^ "Mandelbrot Set Explorer: Mathematical Glossary" . Retrieved 7 October 2007 .

1. ^ Tiozzo, Giulio (15 May 2013), Topological entropy of quadratic polynomials and dimension of sections of the Mandelbrot set , arXiv : 1305.3542

1. ^ "Escape Radius" . Retrieved 17 January 2024 .

1. ^ thatsmaths (7 December 2023). "The Logistic Map is hiding in the Mandelbrot Set" . ThatsMaths . Retrieved 18 February 2024 .

1. ^ Kahn, Jeremy (8 August 2001). "The Mandelbrot Set is Connected: a Topological Proof" (PDF) .

1. ^ The Mandelbrot set, theme and variations . Tan, Lei. Cambridge University Press, 2000. ISBN 978-0-521-77476-5 . Section 2.1, "Yoccoz para-puzzles", p. 121

1. ^ Weisstein, Eric W. "Mandelbrot Set Lemniscate" . Wolfram Mathworld . Retrieved 17 July 2023 .

1. ^ Brucks, Karen M.; Bruin, Henk (28 June 2004). Topics from One-Dimensional Dynamics . Cambridge University Press. p. 264. ISBN 978-0-521-54766-6 .

1. ^ Devaney, Robert (9 March 2018). An Introduction To Chaotic Dynamical Systems . CRC Press. p. 147. ISBN 978-0-429-97085-6 .

1. ^ a b c d Ivancevic, Vladimir G.; Ivancevic, Tijana T. (6 February 2007). High-Dimensional Chaotic and Attractor Systems: A Comprehensive Introduction . Springer Science & Business Media. pp. 492- 493. ISBN 978-1-4020-5456-3 .

1. ^ Devaney, Robert L.; Branner, Bodil (1994). Complex Dynamical Systems: The Mathematics Behind the Mandelbrot and Julia Sets: The Mathematics Behind the Mandelbrot and Julia Sets . American Mathematical Soc. pp. 18- 19. ISBN 978-0-8218-0290-8 .

1. ^ Redona, Jeffrey Francis (1996). The Mandelbrot set (Masters of Arts in Mathematics). Theses Digitization Project.

1. ^ Anna Miriam Benini (2017). "A survey on MLC, Rigidity and related topics". arXiv : 1709.09869 [ math.DS ].

1. ^ Douady, Adrien; Hubbard, John H. Exploring the Mandelbrot set. The Orsay Notes . p. 12.

1. ^ Jung, Wolf (2002). Homeomorphisms on Edges of the Mandelbrot Set (Doctoral thesis). RWTH Aachen University . urn : nbn:de:hbz:82-opus-3719 .

1. ^ a b Hubbard, J. H. (1993). "Local connectivity of Julia sets and bifurcation loci: three theorems of J.-C. Yoccoz" (PDF) . Topological methods in modern mathematics (Stony Brook, NY, 1991) . Houston, TX: Publish or Perish. pp. 467- 511. MR 1215974 . . Hubbard cites as his source a 1989 unpublished manuscript of Yoccoz.

1. ^ Lei (1990). "Similarity between the Mandelbrot set and Julia Sets" . Communications in Mathematical Physics . 134 (3): 587- 617. Bibcode : 1990CMaPh.134..587L . doi : 10.1007/bf02098448 . S2CID 122439436 .

1. ^ J. Milnor (1989). "Self-Similarity and Hairiness in the Mandelbrot Set". In M. C. Tangora (ed.). Computers in Geometry and Topology . New York: Taylor & Francis. pp. 211- 257. ISBN 9780824780319 . )

1. ^ "Mandelbrot Viewer" . math.hws.edu . Retrieved 1 March 2025 .

1. ^ a b Shishikura, Mitsuhiro (1998). "The Hausdorff dimension of the boundary of the Mandelbrot set and Julia sets". Annals of Mathematics . Second Series. 147 (2): 225- 267. arXiv : math.DS/9201282 . doi : 10.2307/121009 . JSTOR 121009 . MR 1626737 . S2CID 14847943 . .

1. ^ Katunin, Andrzej; Fedio, Kamil (2015). "On a Visualization of the Convergence of the Boundary of Generalized Mandelbrot Set to (n-1)-Sphere" (PDF) . Journal of Applied Mathematics and Computational Mechanics . 14 (1): 63- 69. doi : 10.17512/jamcm.2015.1.06 . Retrieved 18 May 2022 .

1. ^ Sims, Karl. "Understanding Julia and Mandelbrot Sets" . karlsims.com . Retrieved 27 January 2025 .

1. ^ a b "Number Sequences in the Mandelbrot Set" . youtube.com . The Mathemagicians' Guild. 4 June 2020. Archived from the original on 30 October 2021.

1. ^ Flake, Gary William (1998). The Computational Beauty of Nature . MIT Press. p. 125. ISBN 978-0-262-56127-3 .

1. ^ Klebanoff, Aaron D. (2001). "π in the Mandelbrot Set". Fractals . 9 (4): 393- 402. doi : 10.1142/S0218348X01000828 .

1. ^ Paul Siewert, Pi in the Mandelbrot set. Bachelor Thesis, Universität Göttingen, 2023

1. ^ Brockmoeller, Thies; Scherz, Oscar; Srkalovic, Nedim (2025). "Pi in the Mandelbrot set everywhere". arXiv : 2505.07138 [ math.DS ].

1. ^ a b Devaney, Robert L. (April 1999). "The Mandelbrot Set, the Farey Tree, and the Fibonacci Sequence" . The American Mathematical Monthly . 106 (4): 289- 302. doi : 10.2307/2589552 . ISSN 0002-9890 . JSTOR 2589552 .

1. ^ a b c d Devaney, Robert L. (7 January 2019). "Illuminating the Mandelbrot set" (PDF) .

1. ^ Allaway, Emily (May 2016). "The Mandelbrot Set and the Farey Tree" (PDF) .

1. ^ a b c Devaney, Robert L. (29 December 1997). "The Mandelbrot Set and the Farey Tree" (PDF) .

1. ^ Douady, A.; Hubbard, J (1982). "Iteration des Polynomials Quadratiques Complexes" (PDF) .

1. ^ "The Mandelbrot Set Explorer Welcome Page" . math.bu.edu . Retrieved 17 February 2024 .

1. ^ "Maths Town" . Patreon . Retrieved 17 February 2024 .

1. ^ Fang, Fang; Aschheim, Raymond; Irwin, Klee (December 2019). "The Unexpected Fractal Signatures in Fibonacci Chains" . Fractal and Fractional . 3 (4): 49. arXiv : 1609.01159 . doi : 10.3390/fractalfract3040049 . ISSN 2504-3110 .

1. ^ "7 The Fibonacci Sequence" . math.bu.edu . Retrieved 17 February 2024 .

1. ^ "fibomandel angle 0.51" . Desmos . Retrieved 17 February 2024 .

1. ^ Andrzej Katunin (2017). A Concise Introduction to Hypercomplex Fractals . CRC Press. p. 21. ISBN 978-1-351-80121-8 .

1. ^ a b Lisle, Jason (1 July 2021). Fractals: The Secret Code of Creation . New Leaf Publishing Group. p. 28. ISBN 978-1-61458-780-4 .

1. ^ Devaney, Robert L. (4 May 2018). A First Course In Chaotic Dynamical Systems: Theory And Experiment . CRC Press. p. 259. ISBN 978-0-429-97203-4 .

1. ^ Kappraff, Jay (2002). Beyond Measure: A Guided Tour Through Nature, Myth, and Number . World Scientific. p. 437. ISBN 978-981-02-4702-7 .

1. ^ Hooper, Kenneth J. (1 January 1991). "A note on some internal structures of the Mandelbrot Set" . Computers & Graphics . 15 (2): 295- 297. doi : 10.1016/0097-8493(91)90082-S . ISSN 0097-8493 .

1. ^ Cunningham, Adam (20 December 2013). "Displaying the Internal Structure of the Mandelbrot Set" (PDF) .

1. ^ Youvan, Douglas C (2024). "Shades Within: Exploring the Mandelbrot Set Through Grayscale Variations" . Pre-print . doi : 10.13140/RG.2.2.24445.74727 .

1. ^ Schleicher, Dierk (2004). "On Fibers and Local Connectivity of Mandelbrot and Multibrot Sets". In Lapidus, Michel L.; van Frankenhuijsen, Machiel (eds.). Fractal Geometry and Applications: A Jubilee of Benoît Mandelbrot, Part 1 . American Mathematical Society. pp. 477- 517.

1. ^ Rudy Rucker 's discussion of the CCM: CS.sjsu.edu Archived 3 March 2017 at the Wayback Machine

1. ^ a b Barrallo, Javier (2010). "Expanding the Mandelbrot Set into Higher Dimensions" (PDF) . BridgesMathArt . Retrieved 15 September 2021 .

1. ^ a b Inou, Hiroyuki; Kawahira, Tomoki (23 March 2022), Accessible hyperbolic components in anti-holomorphic dynamics , arXiv : 2203.12156

1. ^ Gauthier, Thomas; Vigny, Gabriel (2 February 2016), Distribution of postcritically finite polynomials iii: Combinatorial continuity , arXiv : 1602.00925

1. ^ Jarzębowicz, Aleksander; Luković, Ivan; Przybyłek, Adam; Staroń, Mirosław; Ahmad, Muhammad Ovais; Ochodek, Mirosław (2 January 2024). Software, System, and Service Engineering: S3E 2023 Topical Area, 24th Conference on Practical Aspects of and Solutions for Software Engineering, KKIO 2023, and 8th Workshop on Advances in Programming Languages, WAPL 2023, Held as Part of FedCSIS 2023, Warsaw, Poland, 17-20 September 2023, Revised Selected Papers . Springer Nature. p. 142. ISBN 978-3-031-51075-5 .

1. ^ Katunin, Andrzej (5 October 2017). A Concise Introduction to Hypercomplex Fractals . CRC Press. p. 6. ISBN 978-1-351-80121-8 .

1. ^ Farlow, Stanley J. (23 October 2012). An Introduction to Differential Equations and Their Applications . Courier Corporation. p. 447. ISBN 978-0-486-13513-7 .

1. ^ Saha, Amit (1 August 2015). Doing Math with Python: Use Programming to Explore Algebra, Statistics, Calculus, and More! . No Starch Press. p. 176. ISBN 978-1-59327-640-9 .

1. ^ Crownover, Richard M. (1995). Introduction to Fractals and Chaos . Jones and Bartlett. p. 201. ISBN 978-0-86720-464-3 .

1. ^ "Mandelbrot Fractal Set visualization in Python" . GeeksforGeeks . 3 October 2018 . Retrieved 23 March 2025 .

## Further reading

- Milnor, John W. (2006). Dynamics in One Complex Variable . Annals of Mathematics Studies. Vol. 160 (Third ed.). Princeton University Press. ISBN 0-691-12488-4 . (First appeared in 1990 as a Stony Brook IMS Preprint , available as arXiV:math.DS/9201272 )

- Lesmoir-Gordon, Nigel (2004). The Colours of Infinity: The Beauty, The Power and the Sense of Fractals . Clear Press. ISBN 1-904555-05-5 . (includes a DVD featuring Arthur C. Clarke and David Gilmour )

- Peitgen, Heinz-Otto ; Jürgens, Hartmut ; Saupe, Dietmar (2004) [1992]. Chaos and Fractals: New Frontiers of Science . New York: Springer. ISBN 0-387-20229-3 .

## External links

- Video: Mandelbrot fractal zoom to 6.066 e228

- Relatively simple explanation of the mathematical process , by Dr Holly Krieger , MIT

- Mandelbrot Set Explorer : Browser based Mandelbrot set viewer with a map-like interface

- Various algorithms for calculating the Mandelbrot set (on Rosetta Code )

- Fractal calculator written in Lua by Deyan Dobromiroiv, Sofia, Bulgaria